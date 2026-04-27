// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import manifest from 'manifest';
import React from 'react';
import {connect} from 'react-redux';

import type {Channel} from '@mattermost/types/channels';
import type {GlobalState} from '@mattermost/types/store';

import {getCurrentUserLocale} from 'mattermost-redux/selectors/entities/i18n';
import {getProfileSetInCurrentTeam, getProfilesInCurrentTeam} from 'mattermost-redux/selectors/entities/users';

import {t} from '../i18n/messages';
import {CLOSE_FORWARD_MODAL} from '../reducers';
import {
    buildChannelOptionLabel,
    formatUserDisplayName,
    shouldHideChannelDueToDeactivatedMembers,
    shouldHideChannelNotInCurrentTeam,
    type ChannelLabelCopy,
    type UserProfileLite,
} from '../utils/channel_picker';

import './forward_modal.scss';

type UsernameSuggestion = {
    username: string;
    label: string;
};

type Props = {
    dispatch: (action: {type: string; payload?: {post: unknown}}) => void;
    visible: boolean;
    postId: string | null;
    channelOptions: Array<{id: string; label: string}>;
    siteURL: string;
    usernameSuggestions: UsernameSuggestion[];
    currentTeamId: string;
    currentUserId: string;
    locale: string;
};

type ModalState = {
    targetChannelId: string;
    dmUsername: string;
    comment: string;
    error: string;
    submitting: boolean;
    apiSuggestions: UsernameSuggestion[];
    suggestLoading: boolean;
    userSuggestOpen: boolean;
};

const SUGGEST_DEBOUNCE_MS = 280;
const SUGGEST_LIMIT = 40;

const InfoIcon = () => (
    <svg
        xmlns='http://www.w3.org/2000/svg'
        version='1.1'
        width='20'
        height='20'
        fill='currentColor'
        viewBox='0 0 24 24'
        aria-hidden='true'
    >
        <path d='M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z'/>
    </svg>
);

class ForwardModal extends React.PureComponent<Props, ModalState> {
    constructor(props: Props) {
        super(props);
        this.state = {
            targetChannelId: '',
            dmUsername: '',
            comment: '',
            error: '',
            submitting: false,
            apiSuggestions: [],
            suggestLoading: false,
            userSuggestOpen: false,
        };
    }

    private suggestDebounce: ReturnType<typeof setTimeout> | null = null;
    private suggestFetchAbort: AbortController | null = null;

    componentDidUpdate(prevProps: Props) {
        if (this.props.visible && !prevProps.visible) {
            if (this.suggestDebounce) {
                clearTimeout(this.suggestDebounce);
                this.suggestDebounce = null;
            }
            this.abortSuggestFetch();
            this.setState({
                targetChannelId: '',
                dmUsername: '',
                comment: '',
                error: '',
                submitting: false,
                apiSuggestions: [],
                suggestLoading: false,
                userSuggestOpen: false,
            });
        }
    }

    componentWillUnmount() {
        if (this.suggestDebounce) {
            clearTimeout(this.suggestDebounce);
        }
        this.abortSuggestFetch();
    }

    private abortSuggestFetch = () => {
        if (this.suggestFetchAbort) {
            this.suggestFetchAbort.abort();
            this.suggestFetchAbort = null;
        }
    };

    private scheduleUserAutocomplete = (raw: string) => {
        const {siteURL, currentTeamId} = this.props;
        if (this.suggestDebounce) {
            clearTimeout(this.suggestDebounce);
        }
        this.abortSuggestFetch();
        const term = raw.trim().replace(/^@/, '');
        if (!term || !currentTeamId) {
            this.setState({apiSuggestions: [], suggestLoading: false});
            return;
        }
        this.setState({suggestLoading: true});
        this.suggestDebounce = setTimeout(() => {
            this.suggestDebounce = null;
            const ac = new AbortController();
            this.suggestFetchAbort = ac;
            const u = new URL(`${siteURL}/api/v4/users/autocomplete`);
            u.searchParams.set('in_team', currentTeamId);
            u.searchParams.set('name', term);
            u.searchParams.set('limit', String(SUGGEST_LIMIT));
            fetch(u.toString(), {
                credentials: 'include',
                headers: {'X-Requested-With': 'XMLHttpRequest'},
                signal: ac.signal,
            }).
                then(async (res) => {
                    if (!res.ok) {
                        return {users: []};
                    }
                    return res.json() as Promise<{users?: Array<{id: string; username: string; delete_at?: number; nickname?: string; first_name?: string; last_name?: string}>}>;
                }).
                then((data) => {
                    if (ac.signal.aborted) {
                        return;
                    }
                    const cur = this.props.currentUserId;
                    const out: UsernameSuggestion[] = [];
                    const seen = new Set<string>();
                    for (const user of data.users || []) {
                        if (!user?.username || user.id === cur) {
                            continue;
                        }
                        if (user.delete_at && user.delete_at > 0) {
                            continue;
                        }
                        if (seen.has(user.username)) {
                            continue;
                        }
                        seen.add(user.username);
                        out.push({
                            username: user.username,
                            label: `${formatUserDisplayName(user as UserProfileLite)} (@${user.username})`,
                        });
                    }
                    this.setState({apiSuggestions: out, suggestLoading: false});
                }).
                catch((e: unknown) => {
                    if (e instanceof DOMException && e.name === 'AbortError') {
                        return;
                    }
                    this.setState({apiSuggestions: [], suggestLoading: false});
                });
        }, SUGGEST_DEBOUNCE_MS);
    };

    close = () => {
        this.props.dispatch({type: CLOSE_FORWARD_MODAL});
    };

    submit = async () => {
        const {postId, siteURL, locale} = this.props;
        if (!postId) {
            return;
        }

        const {targetChannelId, dmUsername, comment} = this.state;
        const trimmedUser = dmUsername.trim().replace(/^@/, '');

        if (!trimmedUser && !targetChannelId) {
            this.setState({error: t(locale, 'err_need_target')});
            return;
        }

        this.setState({submitting: true, error: ''});

        const body: Record<string, string> = {
            post_id: postId,
            comment,
        };

        if (trimmedUser) {
            try {
                const userRes = await fetch(`${siteURL}/api/v4/users/username/${encodeURIComponent(trimmedUser)}`, {
                    credentials: 'include',
                });
                if (!userRes.ok) {
                    this.setState({
                        submitting: false,
                        error: t(locale, 'err_user_nf'),
                    });
                    return;
                }
                const user = await userRes.json() as {id?: string; delete_at?: number};
                if (user.delete_at && user.delete_at > 0) {
                    this.setState({
                        submitting: false,
                        error: t(locale, 'err_user_deac'),
                    });
                    return;
                }
                if (!user.id) {
                    this.setState({submitting: false, error: t(locale, 'err_bad_resp')});
                    return;
                }
                body.target_user_id = user.id;
            } catch {
                this.setState({submitting: false, error: t(locale, 'err_lookup')});
                return;
            }
        } else {
            body.target_channel_id = targetChannelId;
        }

        try {
            const res = await fetch(`${siteURL}/plugins/${manifest.id}/api/v1/forward`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: JSON.stringify(body),
            });
            if (!res.ok) {
                const text = (await res.text()).trim();
                this.setState({
                    submitting: false,
                    error: text || t(locale, 'err_server', {code: res.status}),
                });
                return;
            }
            this.close();
        } catch (e) {
            this.setState({
                submitting: false,
                error: e instanceof Error ? e.message : t(locale, 'err_network'),
            });
        }
    };

    handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        this.submit().catch(() => undefined);
    };

    private pickUserSuggestion = (username: string) => {
        this.setState({dmUsername: username, userSuggestOpen: false, apiSuggestions: []});
    };

    render() {
        const {visible, channelOptions, usernameSuggestions, currentTeamId, locale} = this.props;
        if (!visible) {
            return null;
        }

        const {targetChannelId, dmUsername, comment, error, submitting, apiSuggestions, suggestLoading, userSuggestOpen} = this.state;
        const searchTerm = dmUsername.trim().replace(/^@/, '');
        const useApiList = searchTerm.length > 0 && Boolean(currentTeamId);
        const listItems = useApiList ? apiSuggestions : usernameSuggestions.slice(0, 25);

        // Поки поле в фокусі — показуємо панель (підказки з Redux, пошук через API, або підказка-заглушка)
        const showSuggestBox = userSuggestOpen;

        return (
            <div
                className='forward-anywhere-overlay'
                role='dialog'
                aria-modal='true'
                aria-labelledby='forward-anywhere-modal-title'
                onClick={(e) => {
                    if (e.target === e.currentTarget) {
                        this.close();
                    }
                }}
            >
                <div
                    className='modal-dialog modal-dialog-centered'
                    onClick={(e) => e.stopPropagation()}
                >
                    <div
                        className='modal-content'
                        role='document'
                    >
                        <div className='GenericModal__wrapper GenericModal__wrapper-enter-key-press-catcher'>
                            <div className='modal-header'>
                                <div className='GenericModal__header__text_container'>
                                    <div className='GenericModal__header'>
                                        <h1
                                            id='forward-anywhere-modal-title'
                                            className='modal-title'
                                        >
                                            {t(locale, 'modal_title')}
                                        </h1>
                                    </div>
                                </div>
                                <button
                                    type='button'
                                    className='forward-anywhere-close close'
                                    aria-label={t(locale, 'modal_close')}
                                    onClick={this.close}
                                >
                                    <span aria-hidden='true'>{'×'}</span>
                                </button>
                            </div>

                            <form onSubmit={this.handleFormSubmit}>
                                <div className='modal-body'>
                                    <div className='GenericModal__body forward-anywhere-body-padding'>
                                        <div
                                            className='forward-anywhere-info'
                                            data-testid='forward-anywhere-notification'
                                        >
                                            <InfoIcon/>
                                            <p style={{margin: 0}}>
                                                {t(locale, 'info_p1')}
                                                <strong>{t(locale, 'info_bold')}</strong>
                                                {t(locale, 'info_p2')}
                                            </p>
                                        </div>

                                        <label
                                            className='forward-anywhere-field-label'
                                            htmlFor='forward-anywhere-channel-select'
                                        >
                                            {t(locale, 'label_channel')}
                                        </label>
                                        <select
                                            id='forward-anywhere-channel-select'
                                            className='forward-anywhere-select'
                                            value={targetChannelId}
                                            disabled={Boolean(dmUsername.trim())}
                                            onChange={(e) => this.setState({targetChannelId: e.target.value})}
                                        >
                                            <option value=''>{t(locale, 'select_placeholder')}</option>
                                            {channelOptions.map((o) => (
                                                <option
                                                    key={o.id}
                                                    value={o.id}
                                                >
                                                    {o.label}
                                                </option>
                                            ))}
                                        </select>

                                        <label
                                            className='forward-anywhere-field-label'
                                            htmlFor='forward-anywhere-dm-user'
                                        >
                                            {t(locale, 'label_dm')}
                                        </label>
                                        <div className='forward-anywhere-user-field'>
                                            <input
                                                id='forward-anywhere-dm-user'
                                                type='text'
                                                className='forward-anywhere-input form-control'
                                                placeholder={t(locale, 'ph_username')}
                                                autoComplete='off'
                                                autoCorrect='off'
                                                autoCapitalize='off'
                                                spellCheck={false}
                                                value={dmUsername}
                                                onChange={(e) => {
                                                    const v = e.target.value;
                                                    this.setState({dmUsername: v, userSuggestOpen: true});
                                                    this.scheduleUserAutocomplete(v);
                                                }}
                                                onFocus={() => this.setState({userSuggestOpen: true})}
                                                onBlur={() => {
                                                    window.setTimeout(() => this.setState({userSuggestOpen: false}), 180);
                                                }}
                                                aria-autocomplete='list'
                                                aria-expanded={showSuggestBox}
                                            />
                                            {showSuggestBox && (
                                                <ul
                                                    className='forward-anywhere-suggest'
                                                    role='listbox'
                                                >
                                                    {suggestLoading && useApiList && (
                                                        <li
                                                            className='forward-anywhere-suggest__hint'
                                                            role='presentation'
                                                        >
                                                            {t(locale, 'sugg_loading')}
                                                        </li>
                                                    )}
                                                    {!suggestLoading && listItems.length === 0 && (
                                                        <li
                                                            className='forward-anywhere-suggest__hint'
                                                            role='presentation'
                                                        >
                                                            {useApiList ? t(locale, 'sugg_not_found') : t(locale, 'sugg_type_name')}
                                                        </li>
                                                    )}
                                                    {listItems.map((s) => (
                                                        <li
                                                            key={s.username}
                                                            role='option'
                                                        >
                                                            <button
                                                                type='button'
                                                                className='forward-anywhere-suggest__btn'
                                                                onMouseDown={(e) => e.preventDefault()}
                                                                onClick={() => this.pickUserSuggestion(s.username)}
                                                            >
                                                                {s.label}
                                                            </button>
                                                        </li>
                                                    ))}
                                                </ul>
                                            )}
                                        </div>

                                        <label
                                            className='forward-anywhere-field-label'
                                            htmlFor='forward-anywhere-comment'
                                        >
                                            {t(locale, 'label_comment')}
                                        </label>
                                        <textarea
                                            id='forward-anywhere-comment'
                                            className='forward-anywhere-textarea form-control custom-textarea'
                                            value={comment}
                                            placeholder={t(locale, 'ph_comment')}
                                            onChange={(e) => this.setState({comment: e.target.value})}
                                        />

                                        {error && (
                                            <div className='forward-anywhere-error'>
                                                {error}
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className='modal-footer'>
                                    <button
                                        type='button'
                                        className='GenericModal__button btn btn-tertiary'
                                        onClick={this.close}
                                        disabled={submitting}
                                    >
                                        {t(locale, 'btn_cancel')}
                                    </button>
                                    <button
                                        type='submit'
                                        className='GenericModal__button btn btn-primary confirm'
                                        disabled={submitting}
                                    >
                                        {submitting ? t(locale, 'btn_sending') : t(locale, 'btn_forward')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        );
    }
}

function mapStateToProps(state: GlobalState) {
    const entities = state.entities;
    const channels = entities.channels?.channels ?? {};
    const myMembers = entities.channels?.myMembers ?? {};
    const membersInChannel = entities.channels?.membersInChannel;
    const currentTeamId = entities.teams?.currentTeamId ?? '';
    const currentUserId = entities.users?.currentUserId ?? '';
    const profiles = (entities.users?.profiles ?? {}) as Record<string, UserProfileLite>;
    const locale = getCurrentUserLocale(state);

    const teamUserSet = getProfileSetInCurrentTeam(state);

    const chCopy: ChannelLabelCopy = {
        directPrefix: t(locale, 'ch_direct'),
        directConversation: t(locale, 'ch_direct_conversation'),
        groupPrefix: t(locale, 'ch_group'),
        groupChat: t(locale, 'ch_group_chat'),
    };

    const root = state as unknown as Record<string, unknown>;
    const pluginSlice = root['plugins-' + manifest.id] as
        | {open?: boolean; post?: {id?: string; post_id?: string}}
        | undefined;

    const visible = Boolean(pluginSlice?.open);
    const rawPost = pluginSlice?.post;
    const postId =
        rawPost?.id ||
        rawPost?.post_id ||
        null;

    const channelOptions: Array<{id: string; label: string}> = [];
    for (const id of Object.keys(myMembers)) {
        const ch: Channel = channels[id];
        if (!ch || ch.delete_at !== 0) {
            continue;
        }
        const inTeam = ch.team_id === currentTeamId && (ch.type === 'O' || ch.type === 'P');
        const isDirectOrGroup = ch.type === 'D' || ch.type === 'G';
        if (!inTeam && !isDirectOrGroup) {
            continue;
        }
        if (shouldHideChannelDueToDeactivatedMembers(ch, currentUserId, profiles, membersInChannel)) {
            continue;
        }
        if (shouldHideChannelNotInCurrentTeam(ch, currentUserId, currentTeamId, teamUserSet, membersInChannel)) {
            continue;
        }
        const label = buildChannelOptionLabel(ch, currentUserId, profiles, membersInChannel, chCopy);
        channelOptions.push({id: ch.id, label});
    }
    channelOptions.sort((a, b) => a.label.localeCompare(b.label, locale, {sensitivity: 'base'}));

    const teamProfiles = getProfilesInCurrentTeam(state, {active: true});
    const usernameSuggestions: UsernameSuggestion[] = [];
    const seen = new Set<string>();
    const maxSuggest = 400;
    for (const p of teamProfiles) {
        if (!p || !p.username || p.id === currentUserId) {
            continue;
        }
        if (p.delete_at && p.delete_at > 0) {
            continue;
        }
        if (seen.has(p.username)) {
            continue;
        }
        seen.add(p.username);
        usernameSuggestions.push({
            username: p.username,
            label: `${formatUserDisplayName(p as UserProfileLite)} (@${p.username})`,
        });
        if (usernameSuggestions.length >= maxSuggest) {
            break;
        }
    }
    usernameSuggestions.sort((a, b) => a.username.localeCompare(b.username, locale, {sensitivity: 'base'}));

    const cfg = entities.general?.config as {SiteURL?: string} | undefined;
    const siteURL = (cfg?.SiteURL || window.location.origin).replace(/\/$/, '');

    return {
        visible,
        postId,
        channelOptions,
        siteURL,
        usernameSuggestions,
        currentTeamId,
        currentUserId: currentUserId || '',
        locale,
    };
}

export default connect(mapStateToProps)(ForwardModal);
