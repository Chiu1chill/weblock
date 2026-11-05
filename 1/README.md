# Weblock

A Chrome Manifest V3 extension that protects selected websites with a password
for up to 12 hours. A correct password permits the current navigation; later
visits still require the password until the lock expires.

## Install for development

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Select **Load unpacked** and choose this directory.
3. Open a website, select the Weblock extension, enter a password twice, and
	choose **Lock this website**.

The password is stored as a salted PBKDF2 hash. Password fields reject paste
and drag-and-drop input. Locks expire automatically 12 hours after they are
created. The extension requires permission to inspect and redirect top-level
navigation requests for websites so locked pages can be stopped before they
load.