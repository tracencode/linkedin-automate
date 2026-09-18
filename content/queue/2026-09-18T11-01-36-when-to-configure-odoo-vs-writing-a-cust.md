---
status: queued
format: contrarian_take
topic: When to configure Odoo vs writing a custom module
createdAt: 2026-09-18T11:01:36.134Z
image: 2026-09-18T11-00-39-When-to-configure-Odoo-vs-writin.png
---

Every other request we get is "just write a small custom module."

It is rarely small. We are the ones who have to upgrade it, explain it to the next consultant, and own it when Odoo moves a field in 19.0.

Last month a customer wanted a unique inventory workflow. The instinct on their side was development. Ours was: sit on our hands for a day and try the stock of settings first. A few configuration tweaks covered it. No extra module. No extra bill of materials for our maintenance calendar.

I would rather lose a customisation invoice than inherit a fork we cannot stand behind after the next upgrade.

We still write modules. We ship them when configuration actually cannot carry the process. The filter is simple: will we still be proud of this code after two version jumps?

When do you push back on a customisation that looks easy on paper?

#Configuration #Customization #Odoo #Inventory
