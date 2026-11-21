// Swellion – inställningar. Byt språk/land här (en sajt per land senare).
window.SWELLION_CONFIG = {
  lang: "sv",
  siteName: "Swellion",
  domain: "swellion.io",
  timeZone: "Europe/Stockholm",
  triesPerQuestion: 2,
  points: { 1: 20, 2: 50, 3: 100 },      // meter per svar: vanlig, ovanlig, sällsynt (max 100 per fråga)
  coffeeUrl: "",                          // TODO: länk till "köp mig en kaffe" (t.ex. Ko-fi/Gumroad)
  premium: {
    priceText: "50 kr",
    checkoutUrl: "",                      // TODO v1: Gumroad-produkt, kopplad till konto via webhook
  },
  // v1: inloggning (Supabase/Firebase) – null i v0. Allt som rör konto går via window.SwellionAccount.
  auth: null
};
