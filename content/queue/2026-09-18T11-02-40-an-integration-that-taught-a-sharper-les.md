---
status: queued
format: question_post
topic: An integration that taught a sharper lesson than the happy path
createdAt: 2026-09-18T11:02:40.955Z
---

We treated a payment-gateway integration as a weekend job.

Collect the payment. Write the accounting. Happy path in the sandbox. Then live traffic arrived: paid in the gateway, not paid in Odoo, or the reverse. We owned both sides of that lie in front of the customer.

The bug was not the API. It was that "success" did not mean the same thing in both systems. Statuses, retries, partial captures — none of that was in the sales conversation.

We stopped, mapped every state, and wrote the boring document nobody wanted. That mapping is now the first artefact I ask for before we take an integration onto our plate.

I will not sell "it just syncs" again. If we cannot name the failure states, we are not ready to ship.

What status mismatch have you had to explain to a customer after go-live?

#Integrations #Payments #Odoo #Accounting
