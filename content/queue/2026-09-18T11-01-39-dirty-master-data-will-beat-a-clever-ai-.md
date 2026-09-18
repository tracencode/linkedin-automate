---
status: queued
format: lesson_learned
topic: Dirty master data will beat a clever AI workflow
createdAt: 2026-09-18T11:01:39.338Z
---

I will not put an AI feature on one of our Odoo apps until I have seen the master data.

We tried anyway once. Invoice approvals, discrepancy flags, the whole demo-friendly stack. On paper it looked like we had a product. In production the vendor names disagreed with themselves, amounts had typos, and the model spent its intelligence shouting about duplicates that were just dirty records.

Our team spent more hours cleaning data than the assistant ever saved. That is on me. I shipped clever before I shipped boring.

Now the rule inside the company is blunt: clean the partners, products, and taxes first. Then we talk about models. A workflow that looks smart on top of a mess just scales the mess.

What is the first table you would refuse to automate until it is clean?

#AI #DataQuality #MasterData #Invoices
