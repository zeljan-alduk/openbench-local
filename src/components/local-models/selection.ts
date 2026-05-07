/**
 * Model identity for selection state.
 *
 * The model id alone is not unique: two different runtimes can host a
 * model with the same id (e.g. Ollama and llama.cpp both serving
 * `llama3.1:8b`). Composing source + id + port keeps the set keyed by
 * the actual endpoint the bench will hit.
 */

import type { DiscoveredLocalModel } from './discovery-direct';

export type SelectedKey = string;

export function modelKey(m: DiscoveredLocalModel): SelectedKey {
  return `${m.source}::${m.id}::${m.port}`;
}
