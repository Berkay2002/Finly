# Security

Finly keeps your plan in the browser and, when sync is on, uploads it only as AES-GCM ciphertext
keyed from a 12-word phrase that never leaves the device. Reminders are encrypted the same way.
Bank keys are held in the browser and sent nowhere except the bank's API.

If you find a weakness in any of that, please report it privately rather than in a public issue:
open a [GitHub security advisory](https://github.com/Berkay2002/Finly/security/advisories/new).
Include the steps to reproduce. You will get a reply within a week.
