// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import {connect} from 'react-redux';

import type {GlobalState} from '@mattermost/types/store';

import {getCurrentUserLocale} from 'mattermost-redux/selectors/entities/i18n';

import {t} from '../i18n/messages';

const ForwardMenuLabel = ({locale}: {locale: string}) => (
    <span>{t(locale, 'post_menu')}</span>
);

function mapState(state: GlobalState) {
    return {locale: getCurrentUserLocale(state)};
}

export default connect(mapState)(ForwardMenuLabel);
