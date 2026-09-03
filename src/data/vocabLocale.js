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
// Hinglish is gone. It was the default, so it is what nearly every message
// this desk has sent was written in -- Roman-script Hindi with English nouns,
// which reads as a broker typing fast rather than as a firm writing to a
// client. Two languages that are actually languages.
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
    // Paperwork was the one group with no table, so a Marathi message printed
    // "Freehold · Resale" in Roman script between two Devanagari lines -- and
    // ownership is exactly the field a buyer reads carefully.
    ownership: {
      freehold: 'फ्रीहोल्ड', leasehold: 'लीजहोल्ड',
      power_of_attorney: 'कुलमुखत्यारपत्र', cooperative: 'सहकारी सोसायटी',
    },
    counted: {
      fan: 'पंखा', light: 'लाइट', ac: 'एसी', wardrobe: 'कपाट',
      tv: 'टीव्ही', bed: 'बेड', geyser: 'गीझर',
    },
    fixture: {
      dining_table: 'डायनिंग टेबल', washing_machine: 'वॉशिंग मशीन',
      cupboard: 'कपाट', sofa: 'सोफा', microwave: 'मायक्रोवेव्ह',
      stove: 'शेगडी', fridge: 'फ्रिज', water_purifier: 'वॉटर प्युरिफायर',
      gas_pipeline: 'गॅस पाइपलाईन', chimney: 'चिमनी',
      modular_kitchen: 'मॉड्यूलर किचन',
    },
    bachelor: { both: 'दोघांसाठी खुले', men: 'फक्त पुरुष', women: 'फक्त महिला' },
    // Lock-in and painting share a shape -- none / 1 month / 6 months / custom
    // -- so they share one table rather than two copies of the same words.
    span: { '1mo': '1 महिना', '6mo': '6 महिने', as_per_cost: 'खर्चाप्रमाणे' },
    transaction: { new: 'नवीन', resale: 'रीसेल' },
    tenant: { family: 'कुटुंब', bachelors: 'बॅचलर्स', company: 'कंपनी' },
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
 * `group` is one of the keys above (subtype · furnish · facing · possession ·
 * amenity · ownership · transaction · tenant · bachelor · counted · fixture · span).
 */
export function localLabel(lang, group, token, englishLabel) {
  if (!token) return englishLabel || ''
  return LOCALE_LABELS[lang]?.[group]?.[token] || englishLabel || ''
}

/** Languages the composer offers. English needs no value table. */
export const MESSAGE_LANGUAGES = ['English', 'Marathi']

/**
 * A stored language preference, or English.
 *
 * Devices carry 'Hinglish' from before it was dropped. Handed straight to the
 * composer that value matches no segment, so the control renders with nothing
 * selected while the message quietly comes out in English — the screen and the
 * text disagreeing about what is being sent. Read every preference through
 * here and a retired language cannot outlive the pack behind it.
 */
export function messageLang(v) {
  return MESSAGE_LANGUAGES.includes(v) ? v : 'English'
}
