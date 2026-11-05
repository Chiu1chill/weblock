# Weblock

A Chrome Manifest V3 extension that protects selected websites with a fixed
password for up to 12 hours. The password is the first 200 digits of pi
(`3` followed by 199 decimal digits) and is shown on the unlock screen. A
correct password permits the current navigation; later visits still require
the password until the lock expires.

The popup and unlock screen share `app.html` and `app.js`. Chrome still requires
a separate manifest and background service worker.

## Install for development

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Select **Load unpacked** and choose the `1` directory.
3. Open a website, select the Weblock extension, and choose **Lock this website**.

The fixed password is stored as a salted PBKDF2 hash. Existing locks are updated
to use it when the extension is upgraded. Locks expire automatically 12 hours
after they are created; they cannot be manually removed. The extension requires
permission to inspect and redirect top-level navigation requests for websites
so locked pages can be stopped before they load.