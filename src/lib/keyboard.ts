export function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof Element
    ? Boolean(
        target.closest(
          "input, textarea, select, [contenteditable='true'], [role='textbox'], [role='combobox']",
        ),
      )
    : false;
}

export function hasPrimaryModifier(event: KeyboardEvent): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey;
}
