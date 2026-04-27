// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * All user-visible UI strings. Keys are stable; values differ per language.
 * Used by t() and registerTranslations.
 */
export const en = {
    post_menu: 'Forward message',
    modal_title: 'Forward message',
    modal_close: 'Close',
    info_p1: 'Forward from private channels and DMs where the default Mattermost action is not available. The new post includes the ',
    info_bold: 'full text',
    info_p2: ' of the original and a link to it. The list includes channels in the current team and conversations with its members.',
    label_channel: 'Channel or group message',
    select_placeholder: '— select —',
    label_dm: 'Or username for a new direct message',
    ph_username: 'username',
    sugg_loading: 'Loading…',
    sugg_not_found: 'No users found',
    sugg_type_name: 'Start typing a name',
    label_comment: 'Comment (optional)',
    ph_comment: 'Add a comment…',
    err_need_target: 'Select a channel or enter a username for a direct message.',
    err_user_nf: 'No user with that name was found.',
    err_user_deac: 'This user is deactivated.',
    err_bad_resp: 'Invalid response from the server.',
    err_lookup: 'Could not look up the user.',
    err_server: 'Server error ({{code}})',
    err_network: 'Network error',
    btn_cancel: 'Cancel',
    btn_forward: 'Forward',
    btn_sending: 'Sending…',
    ch_direct: 'Direct:',
    ch_direct_conversation: 'conversation',
    ch_group: 'Group:',
    ch_group_chat: 'chat',
} as const;

export const uk = {
    post_menu: 'Переслати повідомлення',
    modal_title: 'Переслати повідомлення',
    modal_close: 'Закрити',
    info_p1: 'Пересилання з приватних каналів і особистих розмов, де стандартна кнопка Mattermost недоступна. У новий пост копіюється ',
    info_bold: 'повний текст',
    info_p2: ' оригіналу та посилання на нього. У списку — канали поточної команди та розмови з її учасниками.',
    label_channel: 'Канал або груповий чат',
    select_placeholder: '— оберіть —',
    label_dm: 'Або ім’я користувача для нового Особистого повідомлення',
    ph_username: 'username',
    sugg_loading: 'Завантаження…',
    sugg_not_found: 'Нікого не знайдено',
    sugg_type_name: 'Почніть вводити ім’я',
    label_comment: 'Коментар (необов’язково)',
    ph_comment: 'Додати коментар…',
    err_need_target: 'Оберіть канал або вкажіть ім’я користувача для Особистого повідомлення.',
    err_user_nf: 'Користувача з таким іменем не знайдено.',
    err_user_deac: 'Цей користувач деактивований.',
    err_bad_resp: 'Некоректна відповідь сервера.',
    err_lookup: 'Не вдалося знайти користувача.',
    err_server: 'Помилка сервера ({{code}})',
    err_network: 'Мережева помилка',
    btn_cancel: 'Скасувати',
    btn_forward: 'Переслати',
    btn_sending: 'Надсилання…',
    ch_direct: 'Особисті:',
    ch_direct_conversation: 'розмова',
    ch_group: 'Група:',
    ch_group_chat: 'чат',
} as const;

export type MessageId = keyof typeof en;

/**
 * BCP-47 or Mattermost-style locale (e.g. en, uk) → our bundle id.
 */
export function normalizeLocale(locale: string | undefined | null): 'en' | 'uk' {
    if (!locale) {
        return 'en';
    }
    const l = locale.toLowerCase();
    if (l.startsWith('uk')) {
        return 'uk';
    }
    return 'en';
}

export function getBundle(normalized: 'en' | 'uk'): Readonly<Record<MessageId, string>> {
    return normalized === 'uk' ? uk : en;
}

/**
 * Interpolate {{key}} in template with values.
 */
export function interpolate(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(values[k] ?? ''));
}

export function t(locale: string | undefined | null, id: MessageId, vars?: Record<string, string | number>): string {
    const raw = getBundle(normalizeLocale(locale))[id] ?? en[id];
    return vars ? interpolate(String(raw), vars) : String(raw);
}

/** Keys for `registry.registerTranslations` (Mattermost convention). */
export function getTranslationMapForRegistry(locale: string): Record<string, string> {
    const norm = normalizeLocale(locale);
    const bundle = getBundle(norm);
    const out: Record<string, string> = {};
    const prefix = 'forward-anywhere.';
    (Object.keys(bundle) as MessageId[]).forEach((id) => {
        out[prefix + id] = bundle[id];
    });
    return out;
}
