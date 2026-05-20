# Greenroom Workspace

## Company Overview

Greenroom is the software for independent music venues in the 200 to 1,500 capacity range. The product spans bookings, ticketing, settlement, advancing, hospitality, and reporting. Customers love the completeness; they tolerate that no single workflow is excellent.  

Series A SaaS

~340 paying venues (73 net new last year), 

~$8M ARR ($8.1M, up from $6.4M YoY), 

NDR 116%, NPS +12. 

Customer in focus : The Crescent (650-cap indie venue, Nashville)

For deeper context on deal types, dispute mechanics, and the intentional data messiness, see `product-context.md` (read on demand).

## Team

- Pri Shankar, CEO at Greenroom HQ: Does 5 customer calls a week with bookers and GMs. Her Q4 memo says settlement is where Greenroom is most clearly losing. Frame: "**We are winning on completeness and losing on craft.**"
- Anil, Product Manager at Greenroom 
- Pallavi, Applied AI PM at Greenroom (me)

## Stakeholders

- Mariana Reyes, lead booker at The Crescent: primary user 
  - Runs settlements in spreadsheets at 2am because the in-app tool cannot handle the Vs deals she signs. Four years on the job
- Marcus Holland, GM at The Crescent: venue-ops voice. 
  - Steps in on escalations (e.g. signed off on the $720 Coastal Spell concession, 2025-03-19)
- Diego, tour manager (external counterparty): artist-side voice; 
  - sits across the table at load-out and needs to trace numbers back to source .
- Sarah Kim, agent at WME (external): represents artists in deal negotiation and dispute escalation; 
  - party to the Coastal Spell marketing-recoup dispute, 2025-03-14

Anil interviewed these stakeholders and its trascripts are availabel for reference. 

## The Task

**As per Pri's email : Settlement.** 

Extract from Pri's email : This is where we are most clearly failing. 

- 18% of our customer base actively uses the in-app settlement tool. 
- The other 82% — including most of our largest accounts — default to spreadsheets. The math gets done somewhere else. The 2am ritual happens somewhere else. 
- The trust between the venue and the artist is built somewhere else. We're not in that conversation. We have to be.

**Why Pri picked settlement (not Advance docs or Sponsor reporting, the other two failing surfaces she named):**

1. It's the most trust-critical moment in the venue-artist relationship.
2. 82% of the base goes around the product to do this. That's not a feature gap, it's an existential signal.

**Strategic frame:** Live Nation and AEG are consolidating venues. The independents who survive are the ones agents trust to settle cleanly. Greenroom's job is to be the operational backbone of that. Settlement is the most load-bearing surface in that thesis.

Settlement is several adjacent problems wearing one name: 

- deal modeling, 
- audit trails, 
- real-time prediction, 
- the 2am walkthrough conversation, 
- post-show agent communication, 
- dispute resolution.

Details on Settlement and additonal Product Context are here   Pallavi's/product-context.md

As a AI PM, I need to present a case for the slice I would pick to pick first, why that and not others, a working prototype, A PRD-quality memo explaining design choices, trade-offs, and what I cut & a walkthrough Loom video.

# **A note on the data**

Venue data is messy. Fields drift over time. Prose contradicts structured values. 

Statuses don't always match the underlying reality. Patterns hide across shows that look unremarkable in isolation. 

What the UI shows isn't always what the data says — and neither is necessarily what actually happened.

For example: there are several such real-world messiness in the data, so we need to explore very carefully.


|                                        |                                                                          |                                                                                      |
| -------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| **Embedded Problem**                   | **What's wrong**                                                         | **Spotting it means**                                                                |
| Disputed status with positive sign-off | UI shows "Disputed", artist/agent sign-off text says *"Looks good — TM"* | Reads past the badge to the data and designs a solution that prevents such messiness |


When analyzing any data - 

- Read it  closely, query it directly, and bring skepticism to anything that seems too clean. 
- notice the surface-level view is incomplete

## Product Principles that I believe

Use these as a guardrail whenever I propose, design, or cut something or when you suggest something

1. **Scope tightly. Defend the cut.** Did I pick a slice we can defend and explain why this one?
2. **Take it deep.** Within the slice, how much messiness did I grapple with? What are the areas I overlooked
3. **Show your reasoning.** Did I cover all trade-offs and alternatives?
4. **Design for humans, not screens.** Does the prototype feel like something Mariana would actually want to use at 2am?

## Read when needed

CEO brief on Q4 and settlements - (see `data/ceo-memo.md`)

Interview transcripts with stakeholders - (see `data/transcripts/mariana.md` , `data/transcripts/marcus.md`, `data/transcripts/diego.md`, `data/dispute-thread.md, data/transcripts/sarah-kim.md`

## My preferences

- Be direct and concise. No corporate jargon.
- American English.
- Dates in YYYY-MM-DD.
- No em dashes in generated content. em dashes may be avialable in the prose or the data already added on the folders and that's acceptable.

Goal: pick one slice of the settlement problem, take it deep, and ship a defensible memo plus working prototype in 6 to 8 hours of focused work.