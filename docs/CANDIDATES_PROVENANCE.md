# Provenance Report

Registries: candidates_AL_2026.json (registryVersion 3), candidates_US_2028.json (registryVersion 2), zip_to_cd_AL.csv. Compiled 2026-07-24. Every source URL below was loaded and checked for reachability, first-person voice, and approximate length (~400+ words of the candidate's own words) before inclusion. No URL was accepted on the strength of a search snippet alone.

## 1. Alabama roster confirmation (Phase A1)

The Alabama Secretary of State's site could not be read: sos.alabama.gov and www.sos.alabama.gov both fail with a site-wide certificate error at the fetch layer (four attempts, including the 2026 election-information page), and a Wayback Machine copy was refused by the proxy. Search results confirm the SoS 2026 certification documents exist (e.g. /sites/default/files/election-2026/2026RepublicanCertification.pdf) but their contents were unreadable from this environment. All roster confirmations therefore rest on Ballotpedia's post-runoff race pages, corroborated where noted by AP/ABC, Alabama Reflector, BirminghamWatch, Roll Call, and governor.alabama.gov. This is a single-registry deviation from the SoS-first instruction and is flagged here rather than papered over.

A structural finding contradicts the task premise that certification is complete: Alabama adopted the 2023 remedial congressional map in May 2026 following the Supreme Court's Louisiana v. Callais ruling. That voided the May 19 primary results in AL-1, AL-2, AL-6, and AL-7, reopened filing May 20-22, and set special primaries for August 11, 2026 (Roll Call: rollcall.com/2026/05/12/alabama-governor-sets-aug-11-primary-elections-for-4-house-seats/; Governor's office: governor.alabama.gov/newsroom/2026/05/...redistricting-battle-calls-special-election...). Nominees that do not yet exist are recorded as special_primary_pending, not guessed.

Per-race confirmation:

- Governor: ballotpedia.org/Alabama_gubernatorial_election,_2026. Tuberville (R) won the May 19 primary with 79.1%; Doug Jones (D) with 75.7%. Ronald Burnette Jr. appears there as an independent write-in, not an on-ballot nominee as seeded; recorded as write_in_unverified because the SoS list could not be cross-checked.
- U.S. Senate: ballotpedia.org/United_States_Senate_election_in_Alabama,_2026. Barry Moore (R) confirmed. Everett Wess (D) defeated Dakarai Larriett in the June 16 runoff 54.7%-45.3%; corroborated by abcnews.com (AP wire), alabamareflector.com (2026/06/16), birminghamwatch.org (2026/06/17). This resolves the seeded TBD.
- AL-1: ballotpedia.org/Alabama%27s_1st_Congressional_District_election,_2026. Clyde Jones (D) confirmed (advanced unopposed). GOP nominee pending Aug 11 special primary; the seeded runoff premise (Carl vs. Marques) was voided by the map change, and Marques and McKee re-filed in AL-2.
- AL-2: ballotpedia.org/Alabama%27s_2nd_Congressional_District_election,_2026. Figures (D, incumbent) confirmed. GOP nominee pending Aug 11.
- AL-3: ballotpedia.org/Alabama%27s_3rd_Congressional_District_election,_2026. Rogers (R) 82.9% on May 19; McInnis (D) advanced with the primary canceled.
- AL-4: ballotpedia.org/Alabama%27s_4th_Congressional_District_election,_2026. Aderholt (R) 77.6%; Pusczek (D) 62.8%, both May 19.
- AL-5: ballotpedia.org/Alabama%27s_5th_Congressional_District_election,_2026. Strong (R) advanced with the primary canceled; Sneed (D) won the June 16 runoff 78.5%-21.5%.
- AL-6: ballotpedia.org/Alabama%27s_6th_Congressional_District_election,_2026. No certified general-election candidates for either party; both primaries rerun Aug 11 (GOP: Palmer, Dixon; Dem: Bouma-Sims, Kennedy, Mercer, Pilkington).
- AL-7: ballotpedia.org/Alabama%27s_7th_Congressional_District_election,_2026. Sewell (D, incumbent) confirmed. The seeded "no Republican filed" note is outdated: Ammie Akin and David Perry filed in the reopened window for the Aug 11 special GOP primary.

## 2. Per-candidate source descriptions (Phase A2)

Governor.

Tommy Tuberville (R), 4 sources: coachforgovernor.com/issues, campaign issues page, ten priorities in first person, ~1,300 words; tuberville.senate.gov "Assimilate or go home", Senate floor speech on immigration, ~3,300 words (2026-05); tuberville.senate.gov "Radical Islam" release, floor speech excerpts, ~1,850 words (2026-01); tuberville.senate.gov ICYMI, authored Daily Caller op-ed on the Federal Reserve, ~700 words (2025-07).

Doug Jones (D), 3 sources: wbhm.org 2026-06-24, Q&A on platform, redistricting, strategy, his answers ~1,550 words; dougforalabama.substack.com "As can Kentucky...", authored essay on the Beshear meeting, ~550 words (2026-05); dougforalabama.substack.com "It's time to do what Alabamians do", authored essay on SNAP cuts, ~550 words (2025-11). His campaign site's issue pages are written in third person and were excluded under the first-person rule; his ~225-word announcement post fell below the length bar.

Ronald Burnette Jr. (I, write-in): 0 sources. See thin corpus.

U.S. Senate.

Barry Moore (R), 5 sources, all authored columns: 1819news.com "Why I'm running", announcement op-ed, ~925 words (2025-08); yellowhammernews.com "Putting Alabama first in an America First agenda", ~575 words (2026-04); 1819news.com "Putting American workers first", immigration and labor, ~650 words (2026-05); 1819news.com "Honoring the blue, backing the badge", law enforcement, ~575 words (2026-05); 1819news.com "A republic worth keeping", Independence Day, ~520 words (2026-07). His campaign issues page (barrymooreforalabama.com) is third person and was excluded under the same rule applied to opponents' sites.

Everett Wess (D), 1 source: ny1.com (Spectrum News syndication) 2026-05-15, full Q&A interview, his answers ~1,850 words. Independently re-fetched and confirmed during final verification. See thin corpus.

AL-1. Clyde Jones (D), 1 source: clydeforcongress.com/issues, campaign platform in first person, ~2,000 words. See thin corpus.

AL-2. Shomari Figures (D), 5 sources: figuresforcongress.com/issues, campaign platform (healthcare, education, jobs, gun violence), ~1,500 words; figures.house.gov Roll Call Q&A repost, career and freshman-term interview, ~1,150 words (2025-02); figures.house.gov floor statement on conditioning disaster aid, ~1,050 words (2025-02); figures.house.gov floor statement urging TPS extension for Haitians, ~1,050 words (2025-02); figures.house.gov floor remarks against SNAP and Medicaid cuts, ~420 words (2025-06).

AL-3. Mike Rogers (R), 4 sources, all official statements as prepared for delivery: armedservices.house.gov DocumentID=6416, opening remarks at the National Defense Strategy hearing, ~1,100 words (2026-03); DocumentID=5199, FY26 DoD budget hearing opening statement, ~780 words (2025-06); DocumentID=6615, FY27 NDAA markup opening statement, ~520 words (2026-06); DocumentID=6375, floor statement on FY26 NDAA passage, ~430 words (2025-12). His campaign site has no issues page and no qualifying first-person text. Note: Breaking Defense op-eds under the byline "Mike Rogers" belong to the former Michigan congressman and were discarded to avoid identity confusion.

Lee McInnis (D), 4 sources: ballotpedia.org/Lee_McInnis, Candidate Connection survey, ~24 answers in his own words, ~4,000 words; leemcinnis4alabama.com "Things were already hard enough", campaign essay on wages and costs, ~550 words (2026-06); "You can feel the change", campaign-trail essay on rural voters, ~520 words (2026-05); "What gutting the Department of Education looks like in Alabama", ~420 words (2026-06). His issues page proper is an image placeholder with no text.

AL-4. Robert Aderholt (R), 4 sources: aderholt.house.gov "Generational investment has regional impact", opinion column reposted in full, ~1,150 words (2026-04); appropriations.house.gov FY25 Labor-HHS full-committee markup remarks, ~2,100 words (2024-07); FY27 Labor-HHS full-committee markup remarks, ~750 words (2026-06); FY26 Labor-HHS subcommittee markup remarks, ~520 words (2025-09). His campaign domain failed to resolve.

Amanda Pusczek (D), 1 source: ballotpedia.org/Amanda_Pusczek, Candidate Connection survey in her own words, ~1,150 words. Her campaign policy page (amandaforalabama.com/policy, ~18,000-20,000 words) was excluded on final verification because it is written in third person ("Amanda Pusczek's platform..."), the same rule that excluded Moore's, Doug Jones's, and Sewell's campaign pages. See thin corpus.

AL-5. Dale Strong (R), 4 sources: dalestrongforcongress.com/issues, campaign platform in first person, ~1,150 words; 1819news.com Mayorkas border op-ed, ~1,100 words (2023-09); 1819news.com executive-power and immigration op-ed, ~1,000 words (2024-03); strong.house.gov "2025 review" release, ~850 words substantially in his quoted words (2025-12; flagged as a quote-built release rather than a standalone authored piece).

Andrew Sneed (D), 3 sources: ballotpedia.org/Andrew_Sneed, Candidate Connection survey, ~2,100 words; alreporter.com 2025-12-29 interview feature, his quoted answers ~2,200 words; 256today.com 2026-07 interview feature, his quoted answers ~550 words. Caveat: the two news items are quote-dominated interview features, not verbatim Q&A transcripts; word counts cover his quotes only. They were kept because his campaign site's issue pages are tagline-format with no first-person prose. If the pipeline requires strict transcripts, Sneed drops to 1 qualifying source.

AL-7. Terri Sewell (D), 4 sources: sewell.house.gov January 6 fifth-anniversary testimony, full first-person text, ~650 words (2026-01); Black History Month floor remarks, ~825 words (2026-02); Bloody Sunday 61st-anniversary floor remarks, ~650 words (2026-03); npr.org/transcripts/1084834286, interview on voting rights and redistricting, her answers ~2,100 words (2022-03). terrisewell.com is a parked domain; her actual campaign site is third person and did not qualify.

## 3. Thin corpus

- Ronald Burnette Jr. (Governor, write-in): 0 qualifying sources. No campaign website exists; his presence is Facebook, X, and YouTube (excluded categories; his "Campaign Address" video has no transcript). His Ballotpedia Candidate Connection survey is first person but ~125 words. What exists: ballotpedia.org candidate page, the ~125-word survey, video-only speeches.
- Everett Wess (Senate): 1 qualifying source. His campaign site (wessforsenate.com) has almost no first-person text and its Voter Guide Q&A page serves no body text to fetchers (JS-loaded, verified twice). A WHNT/WDHN candidate Q&A is written in third person. TV "meet the candidate" items are video-only. He did not complete Ballotpedia's survey. Also: sources describe him as an attorney and former municipal judge; the "pastor" descriptor did not verify.
- Clyde Jones (AL-1): 1 qualifying source. His Ballotpedia survey is ~220-240 words; press coverage of his announcement carries under ~270 words of his quotes; campaign blog posts are third person; two local articles returned 403. No op-eds, questionnaires, or transcripts found in text form.
- Amanda Pusczek (AL-4): 1 qualifying source after the voice-consistency exclusion above. What exists: the ~18-20k-word third-person policy page, an under-length (~340-word) newswire Q&A, audio-only and paywalled-video interviews, and a referenced Montgomery Advertiser op-ed that could not be located.

## 4. Per-race source asymmetries

- Governor: 4 (Tuberville) vs 3 (Doug Jones) vs 0 (Burnette, write-in). Type mix differs: Tuberville has a first-person platform page; Jones's platform pages are third person, so his corpus leans on interview and authored essays.
- U.S. Senate: 5 (Moore) vs 1 (Wess). Moore publishes a regular op-ed column; Wess has one qualifying interview. Largest asymmetry in the registry.
- AL-1: 1 (C. Jones) vs no GOP nominee yet.
- AL-2: 5 (Figures) vs no GOP nominee yet.
- AL-3: 4 vs 4, but different types: Rogers is all official/committee statements (no qualifying campaign material); McInnis is survey plus campaign essays (no official record).
- AL-4: 4 (Aderholt, official remarks and a column) vs 1 (Pusczek, survey).
- AL-5: 4 (Strong, platform and op-eds) vs 3 (Sneed, survey and quote-dominated interviews). Sneed's mix is interview-heavy.
- AL-6: none vs none (no nominees exist).
- AL-7: 4 (Sewell) vs no GOP nominee yet.
- Cross-cutting: incumbents benefit from .gov floor/committee transcripts; challengers depend on campaign sites and Ballotpedia surveys. Both sides of every race were searched with the same effort and the same qualification rules; counts differ because the underlying corpora differ.

## 5. Crosswalk (Phase B)

- Source file: tab20_cd11920_zcta520_natl.txt (2020 Census tabulation-block-based relationship file, 2020 ZCTAs to 119th Congressional Districts), downloaded from https://www2.census.gov/geo/docs/maps-data/data/rel2020/cd-sld/tab20_cd11920_zcta520_natl.txt. Pipe-delimited with UTF-8 BOM. No fallback and no third-party substitute was needed. The Alabama rows reflect the 2023 remedial plan (Allen v. Milligan), confirmed empirically (Montgomery 36104 in AL-2; Mobile 36602 split AL-1/AL-2), which is also the plan readopted in May 2026.
- Output: zip_to_cd_AL.csv, 802 data rows, columns zip, district (AL-1..AL-7), share. Filter: GEOID_CD119_20 beginning with state FIPS 01.
- Split-ZIP counts: 658 distinct ZCTAs; 517 single-district; 141 multi-district (max 3 districts for one ZCTA). Every multi-district ZCTA appears as one row per district; nothing was collapsed.
- Share method: share = AREALAND_PART / sum(AREALAND_PART) across all district rows nationwide for that ZCTA, rounded to 4 decimals. Three border ZCTAs (30165, 36855, 38852) extend into GA-14, GA-3, and MS-1, so their Alabama shares sum to less than 1 by design; all other ZCTAs sum to 1.0000 within 0.001. Independently re-verified after generation (row count, split preservation, share sums, district labels).
- Dropped rows: none. The file's 250 no-ZCTA rows (district area not covered by any ZCTA) are not ZCTA rows and are excluded by definition; no zero-area rows existed.

## 6. 2028 tracker (Phase C)

Seeded entries: all ten statuses verified unchanged as of 2026-07-24 (statusAsOf refreshed to 2026-07). Checks confirmed Rubio still Secretary of State, Noem out of DHS since March 2026 (replaced by Markwayne Mullin), Abbott seeking a 4th term, and Jorgensen's May 2026 exploratory committee with no upgrade. No seeded entry declared, formed a committee, or withdrew. Nine entries were added under criterion (b), all speculative, with polling/coverage evidence recorded during review: DeSantis, Cruz, Haley (R); Whitmer, Shapiro, Pritzker, Beshear, Gallego, Emanuel (D).

Borderline names considered and excluded:

- Glenn Youngkin: endorsed Vance for 2028; only sporadic poll-field inclusion.
- Tim Scott: occasional contender-list mentions; no sustained 2028 coverage in 2026.
- Brian Kemp: appears on broad potential lists only; no sustained 2028-framed coverage found.
- Sarah Huckabee Sanders: focused on 2026 Arkansas reelection; one-off mentions only.
- Donald Trump Jr.: polls notably but has never held office or a major-party nomination, failing criterion (b); no declaration.
- Marjorie Taylor Greene: resigned from Congress and explicitly denied 2028 interest.
- Vivek Ramaswamy: 2026 GOP nominee for Ohio governor; current coverage is about that race.
- Wes Moore: has repeatedly and explicitly said he is not running in 2028.
- Cory Booker: quotes are one-off; absent from major 2028 polling fields.
- Tim Walz: consideration quotes date to early 2025; focused on 2026 MN reelection.
- Mark Cuban: never held office or a nomination, failing criterion (b); no declaration.
- Stephen A. Smith: ruled out a run in early 2026 and holds no qualifying office.
- Bernie Sanders: on broad lists only; no sustained 2026 coverage as a 2028 candidate.
- Chris Murphy: sporadic speculation; not in major polling fields.
- Jon Ossoff: 2026 coverage centers on his Georgia Senate reelection.
- Mark Kelly: occasional mentions; no sustained coverage or polling inclusion.

Phase C3 source descriptions (top tier; additions beyond the specified six carry empty sources[] pending the next collection pass):

- JD Vance, 4: rev.com Munich Security Conference speech on Europe and free speech, ~4,700 words (2025-02; independently re-verified); rev.com Quantico remarks to Marines on military policy, ~3,600 words (2025-03); rev.com Bitcoin 2025 conference speech on crypto policy, ~4,800 words (2025-05); rev.com CPAC onstage conversation on administration priorities, ~13,000 words (2025-02). whitehouse.gov pages are video-only, so rev.com transcripts substitute.
- Marco Rubio, 4: rev.com first remarks to State Department employees, ~3,500 words (2025-01); rev.com Face the Nation interview on Gaza, Russia, Ukraine, ~3,300 words (2025-02); rev.com press gaggle on the Gaza ceasefire, ~4,300 words (2025-10); rev.com year-end State Department press conference, ~14,500 words (2025-12). state.gov blocks the fetcher via robots.txt, so rev.com transcripts substitute.
- Kamala Harris, 5: rev.com Emerge gala speech, first major post-election address, ~3,200 words (2025-04); time.com full concession speech at Howard University, ~1,400 words (2024-11); theblackwallsttimes.com full Ellipse closing-argument speech, ~5,500 words (2024-10); abc7ny.com full DNC acceptance speech text, ~4,600 words (2024-08); cbsnews.com 60 Minutes interview transcript, ~2,800 words (2024-10). Corpus skews to the 2024 campaign; noted as an asymmetry against Newsom's 2025-26 material.
- Gavin Newsom, 4: gov.ca.gov final State of the State address, ~7,500 words (2026-01); gov.ca.gov 2025 State of the State letter, ~3,200 words (2025-09); gov.ca.gov "Democracy at a Crossroads" address transcript, ~2,100 words (2025-06); foxnews.com authored op-ed on democracy and immigration raids, ~2,000 words (2025-06).
- Pete Buttigieg, 4: petebuttigieg.substack.com essay on the false CPS report targeting his family, ~2,100 words (2026-06); substack essay declining the 2026 Michigan races, ~1,550 words (2025-03); npr.org interview transcript on the Democratic Party's direction, ~2,100 words (2025-07); transportation.gov remarks to the U.S. Conference of Mayors, ~4,700 words (2024-01).
- Alexandria Ocasio-Cortez, 5: rev.com Fighting Oligarchy rally speech (Nampa, Idaho), ~6,700 words (2025-04); npr.org Up First interview on Trump, Democrats, immigration, ~4,700 words (2025-02); ocasio-cortez.house.gov floor speech introducing impeachment articles, ~2,050 words (2024-07); cbsnews.com 60 Minutes interview transcript, ~3,000 words (2019-01); ocasio-cortez.house.gov floor speech on Gaza famine, ~420 words (2024-03, at the length threshold). No authored op-ed found; her campaign site has no first-person issue pages.

## 7. Unresolved and deviations

- Alabama SoS site unreachable (certificate failure at the fetch layer, plus a blocked archive fallback). Roster rests on Ballotpedia with news corroboration; re-verify against the SoS certification PDFs when the site is reachable.
- General-election certification is genuinely incomplete for AL-1, AL-2, AL-6, AL-7 pending the Aug 11, 2026 special primaries. Six nominee slots are structurally empty, not verification failures. Re-run Phase A after Aug 11 (and after any runoffs).
- Burnette's on-ballot status conflicts with the seeded registry (Ballotpedia lists him as a write-in); left as write_in_unverified pending an SoS cross-check.
- Doug Jones: a fourth Substack essay returned repeated 429 errors and was left out; his corpus sits at 3.
- Sneed: two of three sources are quote-dominated interview features rather than verbatim transcripts (flagged in section 2).
- Robots.txt/fetch blocks shaped sourcing: congress.gov (Congressional Record), state.gov, whitehouse.gov (video-only), americanrhetoric.com (403). Official-transcript needs were met via rev.com, house.gov press transcripts, and gov.ca.gov instead.
- 2028: Robert F. Kennedy Jr. and Tucker Carlson appear in some GOP poll fields but were not fully evaluated for inclusion this pass; Greg Abbott's reported 2028 "rule-out" headline was not supported by the quoted text, so he remains listed; both are re-review items for the next monthly pass.
- Census relationship-files landing page returned only a partial section to the fetcher, so the CD119 vintage wording was inferred from the file's naming and contents (cd119, 2020 tabulation blocks) rather than quoted from the page.
