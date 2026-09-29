import React from 'react';
import { VIEW_TYPE_SUBTITLE_PANEL } from '../types';
import { ReactItemView } from './ReactItemView';
import { SubtitlePanel } from '../components/subtitle/SubtitlePanel';
import { t } from '../i18n';

export class SubtitlePanelView extends ReactItemView {
  getViewType(): string {
    return VIEW_TYPE_SUBTITLE_PANEL;
  }

  getDisplayText(): string {
    return t('subtitle.panel');
  }

  getIcon(): string {
    return 'subtitles';
  }

  protected renderContent(): React.ReactNode {
    return <SubtitlePanel />;
  }
}
