import { ItemView, WorkspaceLeaf } from 'obsidian';
import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import type { LangPlayerPluginRef } from '../context';
import { MediaViewProvider } from '../context';
import { ErrorBoundary } from '../components/shared/ErrorBoundary';
import { ActiveMediaSessionProvider } from '../store/mediaSession';

/**
 * Base for the simple React-backed leaf views (subtitle panel, dictation,
 * vocabulary). Centralizes the identical mount/unmount boilerplate — container
 * setup, root creation, ErrorBoundary + MediaViewProvider wrapping, teardown —
 * so subclasses only declare their identity and content. (Previously each view
 * copy-pasted this, and VocabularyView had drifted: it was missing the
 * `lp-view-content` class.)
 */
export abstract class ReactItemView extends ItemView {
  private root: Root | null = null;

  constructor(leaf: WorkspaceLeaf, protected plugin: LangPlayerPluginRef) {
    super(leaf);
  }

  /** The panel element to render inside the shared provider + error boundary. */
  protected abstract renderContent(): React.ReactNode;

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1] as HTMLElement | undefined;
    if (!container) return;
    container.empty();
    container.addClass('lp-view-content');

    this.root = createRoot(container);
    this.root.render(
      <ErrorBoundary>
        <ActiveMediaSessionProvider><MediaViewProvider plugin={this.plugin} source={null}>
          {this.renderContent()}
        </MediaViewProvider></ActiveMediaSessionProvider>
      </ErrorBoundary>,
    );
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
    this.root = null;
  }
}
