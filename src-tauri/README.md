# TOEFL Companion desktop shell

The React frontend is packaged with Tauri 2 as a frameless Windows application.
The main window starts hidden, restores only its last size, position, and
maximized state, and is shown and focused after React mounts the custom title
bar. Its default size is 1280×800 and its minimum size is 960×650.

The title bar uses Tauri's built-in drag-region handler. That single handler
owns both window dragging and double-click maximize/restore behavior. The
minimize, maximize/restore, and close buttons call Tauri window commands, so
Alt+F4 and Windows window-management shortcuts remain available to the OS.

## Windows 11 Snap Layout

Tauri 2 does not currently expose the native `HTMAXBUTTON` behavior for an HTML
maximize button in its supported custom-title-bar API. The third-party
`tauri-plugin-snap-layout` package was evaluated at version 1.0.9, but it is a
new, lightly adopted package that injects a large script and maintains an
unsafe Win32 child-window overlay. It is not included in the production shell
until it has a stronger maintenance and test record. Standard maximize/restore
and Windows keyboard snapping continue to work.
