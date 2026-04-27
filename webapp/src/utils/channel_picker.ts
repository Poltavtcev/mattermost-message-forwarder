// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Channel} from '@mattermost/types/channels';

export type UserProfileLite = {
    username?: string;
    nickname?: string;
    first_name?: string;
    last_name?: string;
    delete_at?: number;
};

/** Localized labels for DM/GM options in the channel select (from i18n). */
export type ChannelLabelCopy = {
    directPrefix: string;
    directConversation: string;
    groupPrefix: string;
    groupChat: string;
};

/** Display name for sidebar-style labels (not @username unless no better option). */
export function formatUserDisplayName(p: UserProfileLite): string {
    const nick = p.nickname?.trim();
    if (nick) {
        return nick;
    }
    const full = [p.first_name, p.last_name].filter(Boolean).join(' ').trim();
    if (full) {
        return full;
    }
    if (p.username) {
        return '@' + p.username;
    }
    return '?';
}

function isDeactivated(p: UserProfileLite | undefined): boolean {
    if (!p) {
        return false;
    }
    return typeof p.delete_at === 'number' && p.delete_at > 0;
}

/**
 * Hide DM/GM if any participant besides the current user is not a member of the current team
 * (uses profilesInTeam / team user id set from Redux).
 */
export function shouldHideChannelNotInCurrentTeam(
    ch: Channel,
    currentUserId: string,
    currentTeamId: string,
    teamUserIds: Set<string> | undefined,
    membersInChannel: Record<string, Record<string, unknown>> | undefined,
): boolean {
    if (!currentTeamId || (ch.type !== 'D' && ch.type !== 'G')) {
        return false;
    }
    if (!teamUserIds || teamUserIds.size === 0) {
        // Team membership not loaded yet — do not hide to avoid empty list glitches.
        return false;
    }

    const members = membersInChannel?.[ch.id];
    let otherIds: string[] = [];
    if (members && Object.keys(members).length > 0) {
        otherIds = Object.keys(members).filter((id) => id !== currentUserId);
    } else if (ch.name?.includes('__')) {
        // DM / GM channel name is often userid__userid__...
        otherIds = ch.name.split('__').filter((id) => id && id !== currentUserId);
    }

    for (const uid of otherIds) {
        if (!teamUserIds.has(uid)) {
            return true;
        }
    }
    return false;
}

/** Skip DM/GM if someone besides current user is deactivated (soft-deleted account). */
export function shouldHideChannelDueToDeactivatedMembers(
    ch: Channel,
    currentUserId: string,
    profiles: Record<string, UserProfileLite>,
    membersInChannel: Record<string, Record<string, unknown>> | undefined,
): boolean {
    if (ch.type !== 'D' && ch.type !== 'G') {
        return false;
    }
    const members = membersInChannel?.[ch.id];
    if (members && Object.keys(members).length > 0) {
        for (const uid of Object.keys(members)) {
            if (uid === currentUserId) {
                continue;
            }
            if (isDeactivated(profiles[uid])) {
                return true;
            }
        }
        return false;
    }

    // Fallback: DM name is often userid__userid
    if (ch.type === 'D' && ch.name && ch.name.includes('__')) {
        for (const uid of ch.name.split('__')) {
            if (!uid || uid === currentUserId) {
                continue;
            }
            if (isDeactivated(profiles[uid])) {
                return true;
            }
        }
    }
    return false;
}

export function buildChannelOptionLabel(
    ch: Channel,
    currentUserId: string,
    profiles: Record<string, UserProfileLite>,
    membersInChannel: Record<string, Record<string, unknown>> | undefined,
    copy: ChannelLabelCopy,
): string {
    if (ch.type === 'O' || ch.type === 'P') {
        return '~' + (ch.display_name || ch.name);
    }

    const memberIds = membersInChannel?.[ch.id] ? Object.keys(membersInChannel[ch.id]) : [];

    if (ch.type === 'D') {
        let otherId = memberIds.find((id) => id !== currentUserId);
        if (!otherId && ch.name?.includes('__')) {
            otherId = ch.name.split('__').find((id) => id !== currentUserId);
        }
        const p = otherId ? profiles[otherId] : undefined;
        if (p && !isDeactivated(p)) {
            return copy.directPrefix + ' ' + formatUserDisplayName(p);
        }
        if (ch.display_name && !looksLikeRawIds(ch.display_name)) {
            return copy.directPrefix + ' ' + ch.display_name;
        }
        return copy.directPrefix + ' ' + (otherId ? shortHint(otherId) : copy.directConversation);
    }

    if (ch.type === 'G') {
        const names: string[] = [];
        for (const uid of memberIds) {
            if (uid === currentUserId) {
                continue;
            }
            const p = profiles[uid];
            if (!p || isDeactivated(p)) {
                continue;
            }
            names.push(formatUserDisplayName(p));
        }
        if (names.length > 0) {
            return copy.groupPrefix + ' ' + names.join(', ');
        }
        if (ch.display_name && !looksLikeRawIds(ch.display_name)) {
            return copy.groupPrefix + ' ' + ch.display_name;
        }
        return copy.groupPrefix + ' ' + (ch.name || copy.groupChat);
    }

    return ch.display_name || ch.name;
}

function looksLikeRawIds(s: string): boolean {
    // Heuristic: internal DM/GM labels like userid__userid (26-char MM ids)
    if (s.includes('__')) {
        return true;
    }
    return (/^[a-z0-9]{20,}$/i).test(s.trim());
}

function shortHint(id: string): string {
    if (id.length <= 8) {
        return id;
    }
    return id.slice(0, 4) + '…' + id.slice(-4);
}
