// ============================================================================
// 🌐 VOCABULARY IN THE CLIENT'S LANGUAGE
// ============================================================================
// Picking Marathi used to change the sentences around the facts and leave the
// facts themselves in English — "पूर्व" never appeared, the message said
// "East facing" in the middle of a Marathi paragraph. Half a translation reads
// worse than none.
//
// So the VALUES get translated too, not just the scaffolding. Keyed on the
// stored token, exactly like the vocabulary itself — never on the English
// label, which is display text and moves.
//
// Hinglish deliberately keeps English nouns: that is what Hinglish is, and a
// broker writing "पूर्व-मुखी" in an otherwise Roman-script message would read
// as a machine translation, which is precisely the impression to avoid.
//
// Anything missing here falls back to the English label. A missing translation
// must never surface a raw token to a client.
// ============================================================================

export const LOCALE_LABELS = {
  Marathi: {
    subtype: {
      apartment: 'फ्लॅट', independent_house: 'स्वतंत्र घर', duplex: 'ड्युप्लेक्स',
      independent_floor: 'स्वतंत्र मजला', villa: 'व्हिला', penthouse: 'पेंटहाऊस',
      studio: 'स्टुडिओ', farm_house: 'फार्महाऊस', plot: 'प्लॉट',
      office: 'ऑफिस', shop: 'दुकान', showroom: 'शोरूम', warehouse: 'गोदाम',
      industrial: 'औद्योगिक जागा', coworking: 'को-वर्किंग जागा',
    },
    furnish: { full: 'पूर्ण सुसज्ज', semi: 'अर्ध सुसज्ज', none: 'विना फर्निचर' },
    facing: {
      north: 'उत्तर', east: 'पूर्व', west: 'पश्चिम', south: 'दक्षिण',
      north_east: 'ईशान्य', north_west: 'वायव्य', south_east: 'आग्नेय', south_west: 'नैऋत्य',
    },
    // The Marathi pack already prints "ताबा" as the label, so the VALUE must not
    // repeat it — it read "ताबा ताबा तयार".
    possession: { ready: 'तयार आहे', under_construction: 'बांधकाम सुरू' },
    amenity: {
      power_backup: 'पॉवर बॅकअप', lift: 'लिफ्ट', gym: 'व्यायामशाळा',
      swimming_pool: 'जलतरण तलाव', intercom: 'इंटरकॉम', garden: 'बाग',
      sports: 'क्रीडा सुविधा', kids_area: 'लहान मुलांसाठी जागा', cctv: 'सीसीटीव्ही',
      gated_community: 'गेटेड सोसायटी', club_house: 'क्लब हाऊस',
      community_hall: 'सभागृह', water_supply: 'पाणीपुरवठा', attached_balcony: 'संलग्न बाल्कनी',
    },
  },
}

/**
 * The label for `token` in `lang`, falling back to the English label.
 * `group` is one of the keys above (subtype · furnish · facing · possession · amenity).
 */
export function localLabel(lang, group, token, englishLabel) {
  if (!token) return englishLabel || ''
  return LOCALE_LABELS[lang]?.[group]?.[token] || englishLabel || ''
}

/** Languages the composer offers. English and Hinglish need no value table. */
export const MESSAGE_LANGUAGES = ['Hinglish', 'English', 'Marathi']
