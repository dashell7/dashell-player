import React, { createContext, useContext } from 'react';
import { useStore, type UseBoundStore } from 'zustand';
import { createStore, type StateCreator, type StoreApi } from 'zustand/vanilla';

export const MediaSessionContext = createContext<string | null>(null);
const active = createStore(() => ({id: 'default'}));
const sessions = new Set<string>();
const factories = new Set<{release: (id: string) => void}>();
export function getActiveMediaSession(): string { return active.getState().id; }
export function activateMediaSession(id: string): void {
  sessions.delete(id);
  sessions.add(id);
  active.setState({id});
}
export function releaseMediaSession(id: string): void {
  sessions.delete(id);
  if (getActiveMediaSession() === id) active.setState({id: [...sessions].at(-1) ?? 'default'});
  factories.forEach(factory => factory.release(id));
}
export function useMediaSessionId(): string {
  const owned = useContext(MediaSessionContext);
  const current = useStore(active, s => s.id);
  return owned ?? current;
}
export function ActiveMediaSessionProvider({children}: {children: React.ReactNode}): React.ReactElement {
  const id = useStore(active, s => s.id);
  return React.createElement(MediaSessionContext.Provider, {value: id, key: id}, children);
}

type ScopedStore<T> = UseBoundStore<StoreApi<T>> & {forSession: (id: string) => StoreApi<T>};
/** Player roots own isolated stores. Shared subtitle/practice panels and commands
 * follow the most recently focused player. Async callbacks capture that store. */
export function create<T>(initializer: StateCreator<T>): ScopedStore<T> {
  const stores = new Map<string, StoreApi<T>>();
  const forSession = (id: string): StoreApi<T> => {
    let store = stores.get(id);
    if (!store) { store = createStore(initializer); stores.set(id, store); }
    return store;
  };
  factories.add({release: id => stores.delete(id)});
  const hook = (<U>(selector: (state: T) => U = state => state as unknown as U): U =>
    useStore(forSession(useMediaSessionId()), selector)) as ScopedStore<T>;
  hook.forSession = forSession;
  hook.getState = () => forSession(getActiveMediaSession()).getState();
  hook.getInitialState = () => forSession(getActiveMediaSession()).getInitialState();
  hook.setState = ((...args: Parameters<StoreApi<T>['setState']>) => {
    const setter = forSession(getActiveMediaSession()).setState;
    (setter as (...args: Parameters<typeof setter>) => void)(...args);
  }) as StoreApi<T>['setState'];
  hook.subscribe = listener => forSession(getActiveMediaSession()).subscribe(listener);
  return hook;
}
export function useStoreApi<T>(store: ScopedStore<T>): StoreApi<T> {
  return store.forSession(useMediaSessionId());
}
