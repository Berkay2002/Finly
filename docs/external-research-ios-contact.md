I reviewed the current compatibility data and primary Apple/WebKit sources as of **18 September 2026**. The practical conclusion is fairly clear:

> **A pure iOS Home Screen PWA cannot read or query the user's Contacts database, and it cannot register itself as an iOS Share Sheet target. The reliable web-only solution is to have the user export/share a `.vcf` to Files and then import that file with `<input type="file">`.**

One correction to the browser premise: “all iOS browsers use WebKit” is no longer literally true everywhere. Apple has allowed approved alternative browser engines in the EU since iOS 17.4. However, Apple explicitly said Home Screen web apps **continue to be built directly on WebKit**, and its current Add-to-Home-Screen interface for alternative-engine browsers passes the manifest/cookies to the system rather than turning the installed web app into, for example, a Blink-powered Chrome PWA. I found no current Apple documentation reversing that architecture. So installing the PWA through Chrome does **not** give it Chrome-for-Android APIs. ([Apple Developer][1])

[Apple — alternative browser engines on iOS](https://developer.apple.com/support/alternative-browser-engines/)
[Apple — SFAddToHomeScreenActivityItem](https://developer.apple.com/documentation/safariservices/sfaddtohomescreenactivityitem)

### Verdicts

| Question                                                                  | iOS Home Screen PWA, Sep 2026                                                 |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `navigator.contacts.select()`                                             | **Not shipped. Behind a WebKit preference/flag.**                             |
| Import a `.vcf` with `<input type=file>`                                  | **Yes. Recommended web-only route.**                                          |
| Receive Contacts → Share Contact directly through `manifest.share_target` | **No. Not implemented in Safari/iOS.**                                        |
| Drag/drop `.vcf`                                                          | **Generic file drag/drop exists, but not a reliable Contacts→PWA workflow.**  |
| Clipboard                                                                 | **Text works; no supported Contacts/vCard bridge.**                           |
| Bulk iOS contact export                                                   | **Yes. Native Contacts List export and iCloud.com both support bulk export.** |

## 1. Contact Picker API — not available in production Safari/iOS

**Verdict: implemented internally by WebKit, exposed behind a preference since iOS 14.5, but still not enabled in shipping Safari as of Safari/iOS 27. It has not been rejected.**

The history is slightly unusual. WebKit actually implemented the Contact Picker UI in **November 2020**. Changeset 269394 says it added end-to-end iOS support around `CNContactPickerViewController`, presenting the native picker when `ContactsManager.select()` is called. ([WebKit][2])

[WebKit changeset 269394 — Nov. 6, 2020](https://trac.webkit.org/changeset/269394/webkit)

WebKit bug **204132**, “Implement Contacts API,” was filed **12 November 2019**. A February 2021 comment notes the feature appearing in the iOS 14.5 beta, but the bug remains open; WebKit later noted that some UI pieces were still incomplete. ([WebKit Bugzilla][3])

[WebKit bug 204132 — Contact Picker implementation](https://bugs.webkit.org/show_bug.cgi?id=204132)

The current MDN Browser Compatibility Data is more definitive for developers: Safari desktop is unsupported, while Safari on iOS is recorded as available from **iOS 14.5 only behind the `"Contact Picker API"` preference**. ([GitHub][4])

[MDN BCD — ContactsManager.json](https://github.com/mdn/browser-compat-data/blob/main/api/ContactsManager.json)

Can I Use agrees: iOS Safari **14.5 through current 27.x is “Disabled by default.”** It has never had a normal green/shipped release on iOS. ([Can I use][5])

[Can I Use — ContactsManager.select()](https://caniuse.com/mdn-api_contactsmanager_select)

I also checked the release generations you asked about. Safari 17 shipped **18 September 2023**, Safari 18 **16 September 2024**, and neither release notes set contains a Contact Picker shipment. ([Apple Developer][6]) Safari/iOS **19 never existed as a public version number**: Apple changed the naming in 2025 from 18 directly to 26 to align releases with their main calendar year. ([WebKit][7]) Safari 26's September 2025 feature release did not ship Contact Picker, and current compatibility data remains flag-only even after Safari 27's September 2026 release. ([WebKit][8])

[Safari 17 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-17-release-notes)
[Safari 18 release notes](https://developer.apple.com/documentation/safari-release-notes/safari-18-release-notes)
[WebKit — why Safari jumped to 26, June 9 2025](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)
[WebKit features in Safari 26.0 — Sep. 15 2025](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/)
[WebKit features in Safari 27.0 — Sep. 17 2026](https://webkit.org/blog/18325/webkit-features-for-safari-27-0/)

On the **WebKit Standards Positions** side, I found no Contact Picker position issue in the current repository. That should therefore be classified as **no formal signal**, rather than “opposed” or “rejected.” The repository distinguishes explicit `support`, `neutral`, and `oppose` positions. ([GitHub][9])

[WebKit standards-positions repository](https://github.com/WebKit/standards-positions)

There is another important limitation: even if you manually enabled the flag, Contact Picker is **not general Contacts permission**. The W3C API deliberately grants only **one-off, user-mediated access to contacts the user explicitly selects**. It is not an API for taking an arbitrary phone number and silently asking iOS for the associated name. ([W3C][10])

So this would not give you unrestricted phone-number → Contacts-name resolution anyway.

---

## 2. Other web-platform routes to contacts

### `.vcf` through `<input type="file">` — **yes**

This is the useful route.

Safari has supported file inputs on iOS for many years; Apple's documentation dates normal file upload support to iOS 6. ([Apple Developer][11]) A recent iOS 26 WebKit bug also confirms that the ordinary document picker is still invoked by an HTML file input, and locally stored files under **On My iPhone** can be selected successfully. ([WebKit Bugzilla][12]) Historical WebKit bugs specifically involving file inputs in Home Screen web apps confirm that this capability is not confined to ordinary Safari tabs. ([WebKit Bugzilla][13])

You can therefore use something such as:

```html
<input
  type="file"
  accept=".vcf,text/vcard,text/x-vcard"
/>
```

MDN documents both filename extensions and MIME types as valid `accept` specifiers. `accept` is only a **picker hint**, though; your application still needs to validate and parse the file itself. ([MDN Web Docs][14]) There is also an open MDN compatibility issue around iOS not consistently respecting extension-based filters, so don't rely on `.vcf` filtering for correctness. ([GitHub][15])

[MDN — input type=file](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file)

The practical single-contact UX is therefore:

**Contacts → contact → Share Contact → Save to Files → open your PWA → “Import contact” → choose the `.vcf`.**

Apple's current iPhone documentation confirms the Contacts → **Share Contact** workflow and lets the user select which fields to share. ([Apple Support][16])

### Web Share Target — **no**

The attractive flow would have been:

**Contacts → Share Contact → [Your PWA]**

but a pure PWA cannot do this on iOS in 2026. See question 3 below.

### Drag and drop — technically available, but not a good Contacts workflow

Safari/WebKit has supported HTML drag-and-drop on iOS since Safari 11, and iPhone gained system-wide cross-app drag/drop in iOS 15. WebKit's data-transfer implementation can expose actual files through `DataTransfer.files`. ([Apple Developer][17])

So dropping a `.vcf` file from a compatible source into a web app can in principle be supported as an enhancement. However, I found **no primary Apple/WebKit documentation establishing Contacts → drag contact → Home Screen PWA as a supported vCard workflow**. I would not design the product around it.

### Clipboard — useful for manual text only

Safari has supported the Async Clipboard API since Safari 13.1. ([WebKit][18]) But the standardized/supported web clipboard types are things such as `text/plain`, `text/html`, and images; WebKit does not expose a documented Contacts → `text/vcard` clipboard mechanism to websites. ([WebKit][19])

So the user can obviously copy/paste a phone number or name as text, but **clipboard does not provide access to the Contacts database or a reliable vCard import mechanism**.

---

## 3. Can an iOS PWA register as a Web Share Target?

**Verdict: No. There is no “supported since iOS version X”; it has never shipped on iOS.**

MDN's underlying BCD explicitly records:

```text
Safari: false
Safari iOS: false
```

for the manifest `share_target` member. ([GitHub][20])

[MDN BCD — manifest share_target](https://github.com/mdn/browser-compat-data/blob/main/manifests/webapp/share_target.json)

WebKit bug **194593**, requesting Web Share Target support, was opened **13 February 2019** and remains **NEW** as of 2026. ([WebKit Bugzilla][21])

[WebKit bug 194593 — Web Share Target API](https://bugs.webkit.org/show_bug.cgi?id=194593)

Interestingly, WebKit did issue a standards position on this API. The position is **neutral**, not “support” and not “oppose”; WebKit raised integration/security concerns without rejecting the concept outright. ([GitHub][22])

[WebKit standards position #11 — Web Share Target](https://github.com/WebKit/standards-positions/issues/11)

Therefore adding this to your manifest:

```json
{
  "share_target": {
    "action": "/share",
    "method": "POST",
    "enctype": "multipart/form-data",
    "params": {
      "files": [{
        "name": "file",
        "accept": ["text/vcard", ".vcf"]
      }]
    }
  }
}
```

will **not register your PWA in the iOS Share Sheet**.

That is true regardless of whether the PWA was installed through Safari or Chrome.

---

## 4. Bulk export of iOS contacts

**Verdict: Yes. iOS 17+ can natively export multiple contacts; the clean native mechanism is List export rather than arbitrary checkboxes in the normal Contacts view.**

Apple's current iPhone guide says Contacts can export **some or all contacts**. The native workflow is:

**Contacts → Lists → touch and hold a list → Export → choose fields → Done → choose where to send/save the exported contact cards.** ([Apple Support][23])

[Apple — Export contacts on iPhone](https://support.apple.com/guide/iphone/export-contacts-iph075ddebf2/ios)

Thus, for an arbitrary subset, the straightforward native workflow is to put those people into a temporary **List**, export that list, and then delete the temporary list if desired.

This workflow is definitely present in **iOS 17 and later**. Contemporary material shows the same List → Export feature in iOS 16, although I did not find an Apple release note that precisely dates its original introduction, so **“at least iOS 16”** is the safest historical statement.

Apple's iCloud.com route is even more explicit about the resulting format. On a tablet or computer, iCloud Contacts lets you select one, several, or all contacts and choose **Export vCard**. When several contacts are selected, Apple says they are exported as **one vCard containing all of them**. ([Apple Support][24])

[Apple — Export contacts from iCloud.com](https://support.apple.com/guide/icloud/export-contact-information-mmfba748b2/icloud)

Third-party contact-export applications can also generate `.vcf`, CSV, etc., but they require their own Contacts permission and introduce an additional privacy/trust dependency. There is little reason to make that your primary flow now that iOS has native list export.

## Recommended implementation for your web app

For a **pure PWA**, I would implement a prominent **“Import contacts from iPhone”** action backed by:

```html
<input
  type="file"
  accept=".vcf,text/vcard,text/x-vcard"
  multiple
/>
```

Then parse vCard entirely client-side. For each card, extract `FN`/`N` and every `TEL`, normalize the numbers—ideally into a consistent international/E.164 representation where possible—and create your phone-number → display-name mapping. No server upload is necessary.

For one contact, instruct the user:

**Contacts → person → Share Contact → Save to Files → Finly/your PWA → Import contact → select file.**

For many contacts:

**Contacts → Lists → create/select list → long-press list → Export → Save to Files → PWA → Import contacts.**

That extra **Save to Files** step is the major iOS limitation. If you require the significantly smoother **Contacts → Share → your app** flow, or a native contact selector invoked directly from the app, a pure PWA cannot provide it on stable iOS in 2026. That would require a native iOS component/app using Apple's Contacts framework rather than another web API.

[1]: https://developer.apple.com/kr/support/alternative-browser-engines/ "https://developer.apple.com/kr/support/alternative-browser-engines/"
[2]: https://trac.webkit.org/timeline?authors=&daysback=4&from=2020-11-06 "https://trac.webkit.org/timeline?authors=&daysback=4&from=2020-11-06"
[3]: https://bugs.webkit.org/show_bug.cgi?id=204132 "https://bugs.webkit.org/show_bug.cgi?id=204132"
[4]: https://github.com/mdn/browser-compat-data/blob/main/api/ContactsManager.json "https://github.com/mdn/browser-compat-data/blob/main/api/ContactsManager.json"
[5]: https://caniuse.com/mdn-api_contactsmanager_select "https://caniuse.com/mdn-api_contactsmanager_select"
[6]: https://developer.apple.com/documentation/safari-release-notes/safari-17-release-notes?changes=l_1_8_1 "https://developer.apple.com/documentation/safari-release-notes/safari-17-release-notes?changes=l_1_8_1"
[7]: https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/ "https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/"
[8]: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/ "https://webkit.org/blog/17333/webkit-features-in-safari-26-0/"
[9]: https://github.com/WebKit/standards-positions "https://github.com/WebKit/standards-positions"
[10]: https://www.w3.org/TR/contact-picker/ "https://www.w3.org/TR/contact-picker/"
[11]: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingContentforSafarioniPhone/CreatingContentforSafarioniPhone.html "https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/CreatingContentforSafarioniPhone/CreatingContentforSafarioniPhone.html"
[12]: https://bugs.webkit.org/show_bug.cgi?id=306211 "https://bugs.webkit.org/show_bug.cgi?id=306211"
[13]: https://bugs.webkit.org/show_bug.cgi?id=238318 "https://bugs.webkit.org/show_bug.cgi?id=238318"
[14]: https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file "https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/file"
[15]: https://github.com/mdn/browser-compat-data/issues/26043 "https://github.com/mdn/browser-compat-data/issues/26043"
[16]: https://support.apple.com/en-kw/guide/iphone/iph3e0ca2db/ios "https://support.apple.com/en-kw/guide/iphone/iph3e0ca2db/ios"
[17]: https://developer.apple.com/library/archive/documentation/AppleApplications/Conceptual/SafariJSProgTopics/DragAndDrop.html "https://developer.apple.com/library/archive/documentation/AppleApplications/Conceptual/SafariJSProgTopics/DragAndDrop.html"
[18]: https://webkit.org/blog/10855/async-clipboard-api/ "https://webkit.org/blog/10855/async-clipboard-api/"
[19]: https://webkit.org/blog/16574/webkit-features-in-safari-18-4/ "https://webkit.org/blog/16574/webkit-features-in-safari-18-4/"
[20]: https://github.com/mdn/browser-compat-data/blob/main/manifests/webapp/share_target.json "https://github.com/mdn/browser-compat-data/blob/main/manifests/webapp/share_target.json"
[21]: https://bugs.webkit.org/show_bug.cgi?id=194593 "https://bugs.webkit.org/show_bug.cgi?id=194593"
[22]: https://github.com/WebKit/standards-positions/issues/11 "https://github.com/WebKit/standards-positions/issues/11"
[23]: https://support.apple.com/guide/iphone/export-contacts-iph075ddebf2/27/ios/27 "https://support.apple.com/guide/iphone/export-contacts-iph075ddebf2/27/ios/27"
[24]: https://support.apple.com/en-ae/guide/icloud/mmfba748b2/icloud "https://support.apple.com/en-ae/guide/icloud/mmfba748b2/icloud"
