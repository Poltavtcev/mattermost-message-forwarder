// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

package main

import "strings"

// forwardLocale holds templates for the forwarded post body and channel display strings.
type forwardLocale struct {
	// headerStart is "**↪ …**" + " з **" / " from **" (channel name and "** · " follow in builder)
	headerStart     string
	emptyMessage    string
	attachmentsOnly string
	// Suffix for permalink line, includes leading newlines: "\n\n---\n**…:** […]("
	originalLinkLine string
	unknownAuthor   string
	channelDefault  string
	dmDefault    string
	groupDefault string
}

func forwardStringsForUserLocale(locale string) forwardLocale {
	if strings.HasPrefix(strings.ToLower(strings.TrimSpace(locale)), "uk") {
		return forwardLocale{
			headerStart:      "**↪ Переслано** з **",
			emptyMessage:     "*(порожнє повідомлення)*",
			attachmentsOnly:  "*(тільки вкладення / файли)*",
			originalLinkLine: "\n\n---\n**Оригінал:** [відкрити в Mattermost](",
			unknownAuthor:    "невідомо",
			channelDefault:   "канал",
			dmDefault:    "Особисті повідомлення",
			groupDefault: "Груповий чат",
		}
	}
	return forwardLocale{
		headerStart:      "**↪ Forwarded** from **",
		emptyMessage:     "_(empty message)_",
		attachmentsOnly:  "_(attachments / files only)_",
		originalLinkLine: "\n\n---\n**Original:** [open in Mattermost](",
		unknownAuthor:    "Unknown",
		channelDefault:   "channel",
		dmDefault:    "Direct message",
		groupDefault: "Group message",
	}
}

func (fl forwardLocale) formatOriginalLink(permalink string) string {
	if permalink == "" {
		return ""
	}
	return fl.originalLinkLine + permalink + ")"
}

func (fl forwardLocale) emptyBody(onlyAttachments bool) string {
	if onlyAttachments {
		return fl.attachmentsOnly
	}
	return fl.emptyMessage
}
