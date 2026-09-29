import React from 'react';
import { VIEW_TYPE_VOCABULARY } from '../types';
import { ReactItemView } from './ReactItemView';
import { VocabularyPanel } from '../components/vocabulary/VocabularyPanel';
import { t } from '../i18n';

export class VocabularyView extends ReactItemView {
  getViewType(): string {
    return VIEW_TYPE_VOCABULARY;
  }

  getDisplayText(): string {
    return t('vocab.title');
  }

  getIcon(): string {
    return 'book-open';
  }

  protected renderContent(): React.ReactNode {
    return <VocabularyPanel />;
  }
}
