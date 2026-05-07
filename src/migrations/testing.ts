import { registry } from "./registry";

export function resetRegistryForTests(): void {
  registry.clear();
}
