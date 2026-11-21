// Swellion – inställningar. Byt språk/land här (en sajt per land senare).
window.SWELLION_CONFIG = {
  lang: "sv",
  siteName: "Swellion",
  domain: "swellion.io",
  timeZone: "Europe/Stockholm",
  secondsPerQuestion: 30,                // tid per fråga; fel svar kostar inget
  points: { 1: 20, 2: 40, 3: 60, 4: 80, 5: 100 },   // meter per nivå (max 100 per fråga, 500 per omgång)
  coffeeUrl: "",                          // TODO: länk till "köp mig en kaffe" (t.ex. Ko-fi/Gumroad)
  premium: {
    priceText: "50 kr",
    checkoutUrl: "",                      // TODO v1: Gumroad-produkt, kopplad till konto via webhook
  },
  // v1: inloggning (Supabase/Firebase) – null i v0. Allt som rör konto går via window.SwellionAccount.
  auth: null
};
