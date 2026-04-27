// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Post} from '@mattermost/types/posts';

export const OPEN_FORWARD_MODAL = 'forward_anywhere_open';
export const CLOSE_FORWARD_MODAL = 'forward_anywhere_close';

export type ForwardModalState = {
    open: boolean;
    post: Post | null;
};

const initialState: ForwardModalState = {
    open: false,
    post: null,
};

export default function forwardModalReducer(state = initialState, action: {type: string; payload?: {post: Post}}) {
    switch (action.type) {
    case OPEN_FORWARD_MODAL:
        return {
            open: true,
            post: action.payload?.post ?? null,
        };
    case CLOSE_FORWARD_MODAL:
        return initialState;
    default:
        return state;
    }
}
