// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import manifest from 'manifest';
import React from 'react';
import type {Reducer, Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import type {PluginRegistry} from 'types/mattermost-webapp';

import ForwardMenuLabel from './components/forward_menu_label';
import ForwardModal from './components/forward_modal';
import {getTranslationMapForRegistry} from './i18n/messages';
import forwardModalReducer, {OPEN_FORWARD_MODAL} from './reducers';

export default class Plugin {
    public async initialize(registry: PluginRegistry, store: Store<GlobalState>) {
        registry.registerTranslations(getTranslationMapForRegistry);
        registry.registerReducer({reducer: forwardModalReducer as Reducer});

        registry.registerRootComponent(ForwardModal);

        registry.registerPostDropdownMenuAction(
            <ForwardMenuLabel/>,
            ((maybePost: unknown, ...rest: unknown[]) => {
                const fromArg = (p: unknown): {id?: string; post_id?: string} | null => {
                    if (p == null) {
                        return null;
                    }
                    if (typeof p === 'string') {
                        return {id: p};
                    }
                    if (typeof p === 'object') {
                        const o = p as {id?: string; post_id?: string};
                        return o;
                    }
                    return null;
                };

                let post = fromArg(maybePost);
                if (!post?.id && !post?.post_id && rest.length > 0) {
                    post = fromArg(rest[0]);
                }

                const postId = post?.id || post?.post_id;
                if (!postId) {
                    return;
                }

                store.dispatch({
                    type: OPEN_FORWARD_MODAL,
                    payload: {post: {id: postId, ...post}},
                });
            }) as any,
            () => true as any,
        );
    }
}

declare global {
    interface Window {
        registerPlugin(pluginId: string, plugin: Plugin): void;
    }
}

window.registerPlugin(manifest.id, new Plugin());
