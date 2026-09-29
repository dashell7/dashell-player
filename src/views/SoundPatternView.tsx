import React from 'react';
import { VIEW_TYPE_SOUND_PATTERN } from '../types';
import { ReactItemView } from './ReactItemView';
import { SoundPatternPanel } from '../components/soundPattern/SoundPatternPanel';
import { t } from '../i18n';

export class SoundPatternView extends ReactItemView {
  getViewType(): string { return VIEW_TYPE_SOUND_PATTERN; }
  getDisplayText(): string { return t('soundPattern.title'); }
  getIcon(): string { return 'headphones'; }
  protected renderContent(): React.ReactNode { return <SoundPatternPanel />; }
}
