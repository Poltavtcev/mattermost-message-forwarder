package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin"
)

func (p *Plugin) initRouter() *mux.Router {
	router := mux.NewRouter()
	router.Use(p.MattermostAuthorizationRequired)

	apiRouter := router.PathPrefix("/api/v1").Subrouter()
	apiRouter.HandleFunc("/forward", p.handleForwardPost).Methods(http.MethodPost)

	return router
}

// ServeHTTP routes plugin HTTP requests.
func (p *Plugin) ServeHTTP(c *plugin.Context, w http.ResponseWriter, r *http.Request) {
	p.router.ServeHTTP(w, r)
}

func (p *Plugin) MattermostAuthorizationRequired(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Mattermost-User-ID") == "" {
			http.Error(w, "not authorized", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ForwardPostRequest is the JSON body for POST /api/v1/forward.
type ForwardPostRequest struct {
	PostID string `json:"post_id"`
	// TargetChannelID posts into this channel (team channel, private, DM, or GM).
	TargetChannelID string `json:"target_channel_id"`
	// TargetUserID if set, ignored if TargetChannelID is set. Opens or uses DM with this user.
	TargetUserID string `json:"target_user_id"`
	// Comment optional text above the quoted block.
	Comment string `json:"comment"`
}

func (p *Plugin) handleForwardPost(w http.ResponseWriter, r *http.Request) {
	userID := r.Header.Get("Mattermost-User-ID")

	var req ForwardPostRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid JSON body", http.StatusBadRequest)
		return
	}
	req.PostID = strings.TrimSpace(req.PostID)
	req.TargetChannelID = strings.TrimSpace(req.TargetChannelID)
	req.TargetUserID = strings.TrimSpace(req.TargetUserID)
	req.Comment = strings.TrimSpace(req.Comment)

	if req.PostID == "" {
		http.Error(w, "post_id is required", http.StatusBadRequest)
		return
	}
	if req.TargetChannelID == "" && req.TargetUserID == "" {
		http.Error(w, "target_channel_id or target_user_id is required", http.StatusBadRequest)
		return
	}

	srcPost, appErr := p.API.GetPost(req.PostID)
	if appErr != nil {
		p.API.LogWarn("forward: GetPost failed", "error", appErr.Error())
		http.Error(w, "source message not found", http.StatusNotFound)
		return
	}
	if srcPost == nil {
		http.Error(w, "source message not found", http.StatusNotFound)
		return
	}

	if _, mErr := p.API.GetChannelMember(srcPost.ChannelId, userID); mErr != nil {
		http.Error(w, "you do not have access to the source message", http.StatusForbidden)
		return
	}

	var targetChannelID string
	if req.TargetChannelID != "" {
		targetChannelID = req.TargetChannelID
		if _, mErr := p.API.GetChannelMember(targetChannelID, userID); mErr != nil {
			http.Error(w, "you are not a member of the destination channel", http.StatusForbidden)
			return
		}
	} else {
		if req.TargetUserID == userID {
			http.Error(w, "cannot forward a direct message to yourself", http.StatusBadRequest)
			return
		}
		targetUser, uErr := p.API.GetUser(req.TargetUserID)
		if uErr != nil || targetUser == nil || targetUser.DeleteAt != 0 {
			http.Error(w, "target user not found or deactivated", http.StatusBadRequest)
			return
		}
		ch, dErr := p.API.GetDirectChannel(userID, req.TargetUserID)
		if dErr != nil || ch == nil {
			p.API.LogWarn("forward: GetDirectChannel failed", "error", errString(dErr))
			http.Error(w, "could not open a direct message with that user", http.StatusBadRequest)
			return
		}
		targetChannelID = ch.Id
	}

	if !p.userCanPostInChannel(userID, targetChannelID) {
		http.Error(w, "you cannot post in the destination conversation", http.StatusForbidden)
		return
	}

	locale := ""
	if u, uErr := p.API.GetUser(userID); uErr == nil && u != nil && u.Locale != "" {
		locale = u.Locale
	}
	tr := forwardStringsForUserLocale(locale)

	msg, buildErr := p.buildForwardedMessage(srcPost, tr)
	if buildErr != nil {
		p.API.LogError("forward: build message", "error", buildErr.Error())
		http.Error(w, "failed to build message", http.StatusInternalServerError)
		return
	}

	fullMessage := msg
	if req.Comment != "" {
		fullMessage = req.Comment + "\n\n" + msg
	}

	newPost := &model.Post{
		ChannelId: targetChannelID,
		UserId:    userID,
		Message:   fullMessage,
		Type:      model.PostTypeDefault,
	}

	if len(srcPost.FileIds) > 0 {
		newFileIDs, copyErr := p.API.CopyFileInfos(userID, srcPost.FileIds)
		if copyErr != nil {
			p.API.LogError("forward: CopyFileInfos failed", "error", copyErr.Error())
			http.Error(w, "failed to copy attachments: "+copyErr.Error(), http.StatusInternalServerError)
			return
		}
		newPost.FileIds = newFileIDs
	}

	if created, cErr := p.API.CreatePost(newPost); cErr != nil {
		p.API.LogError("forward: CreatePost failed", "error", cErr.Error())
		http.Error(w, "failed to send message: "+cErr.Error(), http.StatusInternalServerError)
		return
	} else {
		writeJSON(w, http.StatusCreated, map[string]string{"id": created.Id})
	}
}

func errString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func (p *Plugin) userCanPostInChannel(userID, channelID string) bool {
	return p.API.HasPermissionToChannel(userID, channelID, model.PermissionCreatePost)
}

func (p *Plugin) buildForwardedMessage(src *model.Post, tr forwardLocale) (string, error) {
	srcChannel, chErr := p.API.GetChannel(src.ChannelId)
	if chErr != nil || srcChannel == nil {
		return "", fmt.Errorf("get source channel: %w", chErr)
	}

	sourceLabel := p.channelLabel(srcChannel, tr)
	authorLabel := tr.unknownAuthor
	if src.UserId != "" {
		if u, uErr := p.API.GetUser(src.UserId); uErr == nil && u != nil {
			authorLabel = "@" + u.Username
		}
	}

	permalink := p.permalinkForPost(srcChannel, src.Id)
	body := strings.TrimSpace(src.Message)
	if body == "" {
		body = tr.emptyBody(len(src.FileIds) > 0)
	}

	// Full original text (not truncated); header + permalink for context.
	var b strings.Builder
	b.WriteString(tr.headerStart)
	b.WriteString(sourceLabel)
	b.WriteString("** · ")
	b.WriteString(authorLabel)
	b.WriteString("\n\n")
	b.WriteString(body)
	if pl := tr.formatOriginalLink(permalink); pl != "" {
		b.WriteString(pl)
	}

	return b.String(), nil
}

func (p *Plugin) channelLabel(ch *model.Channel, tr forwardLocale) string {
	if ch == nil {
		return tr.channelDefault
	}
	switch ch.Type {
	case model.ChannelTypeDirect, model.ChannelTypeGroup:
		return p.dmOrGroupChannelLabel(ch, tr)
	default:
		if ch.DisplayName != "" {
			return "~" + ch.DisplayName
		}
		return "~" + ch.Name
	}
}

func (p *Plugin) dmOrGroupChannelLabel(ch *model.Channel, tr forwardLocale) string {
	users, err := p.API.GetUsersInChannel(ch.Id, model.ChannelSortByUsername, 0, 200)
	if err != nil || len(users) == 0 {
		if ch.DisplayName != "" && !looksLikeInternalDMName(ch.DisplayName) {
			return ch.DisplayName
		}
		if ch.Type == model.ChannelTypeDirect {
			return tr.dmDefault
		}
		return tr.groupDefault
	}
	var parts []string
	for _, u := range users {
		if u == nil || u.DeleteAt != 0 {
			continue
		}
		parts = append(parts, "@"+u.Username)
	}
	if len(parts) == 0 {
		if ch.DisplayName != "" && !looksLikeInternalDMName(ch.DisplayName) {
			return ch.DisplayName
		}
		if ch.Type == model.ChannelTypeDirect {
			return tr.dmDefault
		}
		return tr.groupDefault
	}
	return strings.Join(parts, ", ")
}

func looksLikeInternalDMName(s string) bool {
	if strings.Contains(s, "__") {
		return true
	}
	return false
}

func (p *Plugin) permalinkForPost(ch *model.Channel, postID string) string {
	cfg := p.API.GetConfig()
	var site string
	if cfg != nil && cfg.ServiceSettings.SiteURL != nil {
		site = strings.TrimRight(*cfg.ServiceSettings.SiteURL, "/")
	}
	if site == "" || postID == "" {
		return ""
	}

	teamName := ""
	if ch != nil && ch.TeamId != "" {
		if team, tErr := p.API.GetTeam(ch.TeamId); tErr == nil && team != nil {
			teamName = team.Name
		}
	}
	if teamName != "" {
		return fmt.Sprintf("%s/%s/pl/%s", site, teamName, postID)
	}
	return fmt.Sprintf("%s/pl/%s", site, postID)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
