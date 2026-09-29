import React from 'react';
import { VIEW_TYPE_DICTATION } from '../types';
import { ReactItemView } from './ReactItemView';
import { DictationPanel } from '../components/dictation/DictationPanel';
import { t } from '../i18n';

export class DictationView extends ReactItemView {
  getViewType(): string {
    return VIEW_TYPE_DICTATION;
  }

  getDisplayText(): string {
    return t('dictation.title');
  }

  getIcon(): string {
    return 'type';
  }

  // DictationPanel's own cleanup effect handles session teardown
  // (setDictationOpen(false), index-lock release, overlay restore, etc.)
  // when the React tree unmounts in the base onClose.
  protected renderContent(): React.ReactNode {
    return <DictationPanel />;
  }
}
