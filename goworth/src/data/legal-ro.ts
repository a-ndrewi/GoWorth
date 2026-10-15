import { legalIdentity, type LegalDocumentId } from "./legal";

const operator = legalIdentity.operator.startsWith("[") ? "[NUMELE OPERATORULUI - DE COMPLETAT ÎNAINTE DE LANSARE]" : legalIdentity.operator;
const address = legalIdentity.address.startsWith("[") ? "[ADRESA ȘI ȚARA - DE COMPLETAT ÎNAINTE DE LANSARE]" : legalIdentity.address;
const contact = legalIdentity.contact.startsWith("[") ? "[E-MAIL DE CONTACT - DE COMPLETAT ÎNAINTE DE LANSARE]" : legalIdentity.contact;

export const legalDocumentsRo: Record<LegalDocumentId, { title: string; updated: string; sections: { title: string; body: string }[] }> = {
  privacy: {
    title: "Notă de confidențialitate",
    updated: "Ciornă · 13 octombrie 2026",
    sections: [
      { title: "Cine este responsabil", body: `GoWorth este operat de ${operator}. Adresă: ${address}. Contact pentru confidențialitate: ${contact}. Aceste date trebuie completate înainte de lansarea publică.` },
      { title: "Datele pe care le folosim", body: "Prelucrăm adresa de e-mail și datele de autentificare, numele și numele de utilizator din profil, fotografia de profil dacă încarci una, preferințele de călătorie, destinațiile și locurile salvate, datele și bugetele călătoriilor, activitățile din itinerar, cheltuielile și notele din jurnal. Nu stocăm date ale cardurilor bancare, deoarece cumpărăturile nu sunt disponibile. Dacă permiți accesul la locație, aplicația folosește locația dispozitivului pentru a ordona sugestiile din apropiere; raza de descoperire și orașul ales sunt stocate pe dispozitiv." },
      { title: "De ce le folosim", body: "Folosim datele contului și ale călătoriilor pentru a furniza serviciul solicitat. Jurnalele esențiale de securitate și funcționare ajută la operarea serviciului și la prevenirea abuzurilor. Folosim locația opțională a dispozitivului numai cu permisiunea ta, pentru descoperirea locurilor din apropiere. Poți dezactiva accesul la locație din setările dispozitivului sau poți alege manual un oraș. În prezent, nu folosim analize publicitare și nu vindem date personale." },
      { title: "Servicii și divulgări", body: "Supabase găzduiește autentificarea, datele contului și fotografiile de profil. Când verificarea profilului este activată, OpenAI primește numele, numele de utilizator sau fotografia propusă, pentru moderarea conținutului înainte de publicare. OpenFreeMap furnizează harta, iar Photon primește căutările pe hartă și cererile pentru locurile apropiate, folosind date OpenStreetMap. Wikipedia primește căutările de locuri și poate furniza atracții din apropiere. Wikimedia Commons poate primi cereri pentru fotografiile locurilor. Aceste servicii pot primi adresa ta IP și informații tehnice despre cerere. Când folosești funcțiile respective, poate fi transmis numele unui loc selectat sau zona vizibilă a hărții. Operatorul trebuie să confirme condițiile de prelucrare și păstrare aplicabile OpenAI înainte de lansare. Furnizorii viitoarelor plăți vor fi identificați înainte de lansarea oricărei funcții contra cost." },
      { title: "Stocare și păstrare", body: "Datele contului, elementele salvate și jurnalul rămân până când le ștergi sau îți ștergi contul. Călătoriile înlocuite sunt arhivate ca planuri, iar călătoriile încheiate sunt arhivate ca finalizate. Ștergerea unei călătorii curente elimină itinerarul și cheltuielile, fără a le arhiva. Jurnalele și copiile de rezervă ale furnizorilor pot avea alte perioade de păstrare; operatorul trebuie să confirme și să publice perioadele reale înainte de lansare." },
      { title: "Opțiunile și drepturile tale", body: "Poți modifica profilul și călătoriile, exporta datele contului și solicita ștergerea contului din secțiunea Aspecte legale și confidențialitate. În funcție de legea aplicabilă, poți solicita și accesul, rectificarea, ștergerea, restricționarea sau portabilitatea datelor ori te poți opune prelucrării. Folosește adresa de contact pentru confidențialitate de mai sus. Poți depune o plângere la autoritatea locală pentru protecția datelor. Permisiunea de localizare poate fi retrasă din setările dispozitivului." },
      { title: "Transferuri și măsuri de protecție", body: "Furnizorii enumerați mai sus pot prelucra date în alte țări decât a ta. Înainte de lansare, operatorul trebuie să documenteze regiunea de găzduire, garanțiile relevante pentru transferuri, acordurile cu persoanele împuternicite și măsurile de securitate. GoWorth nu ia decizii automate cu efecte juridice sau alte efecte semnificative similare." },
      { title: "Modificări", body: "Vom actualiza această notă când se schimbă modul de prelucrare a datelor, inclusiv înainte de activarea abonamentelor sau plăților. Modificările importante vor fi comunicate în aplicație sau prin alt mijloc adecvat." },
    ],
  },
  terms: {
    title: "Termeni de utilizare",
    updated: "Ciornă · 13 octombrie 2026",
    sections: [
      { title: "Furnizorul serviciului", body: `GoWorth este furnizat de ${operator}, ${address}. Contact: ${contact}. Aceste date trebuie completate înainte de lansarea publică.` },
      { title: "Ce oferă GoWorth", body: "GoWorth te ajută să descoperi destinații, să planifici călătorii, să urmărești un buget personal și să păstrezi un jurnal de călătorie. Aplicația nu face rezervări, nu vinde servicii de călătorie, nu oferă asistență de urgență și nu procesează plăți în prezent. Sugestiile de călătorie și informațiile de pe hartă sunt orientative și pot fi incomplete sau se pot schimba." },
      { title: "Contul tău", body: "Păstrează în siguranță datele de autentificare și folosește aplicația în mod legal. Ești responsabil pentru detaliile călătoriilor și notele adăugate. Nu încărca materiale pe care nu ai dreptul să le folosești, nu împiedica funcționarea serviciului și nu îl folosi pentru a face rău altora." },
      { title: "Conținutul tău", body: "Păstrezi drepturile asupra propriilor note și date despre călătorii. Acordi GoWorth numai permisiunile necesare pentru stocarea, afișarea și prelucrarea acestora în cadrul serviciului. Îți poți exporta datele și șterge contul din aplicație." },
      { title: "Informații despre călătorii și hărți", body: "Verifică programul, costurile, transportul, condițiile de siguranță, accesibilitatea, regulile privind vizele și recomandările locale din surse oficiale înainte de a acționa. Traseele deschise într-un serviciu extern de navigație sunt supuse termenilor acelui serviciu. GoWorth nu garantează că o locație, un traseu sau o sugestie este exactă ori sigură." },
      { title: "Disponibilitate și modificări", body: "Serviciul se poate schimba sau poate fi întrerupt pentru mentenanță ori din motive care nu țin de noi. Drepturile obligatorii ale consumatorilor rămân aplicabile. Modificările importante ale acestor termeni vor fi comunicate înainte de intrarea lor în vigoare, acolo unde legea impune acest lucru." },
      { title: "Funcții contra cost", body: "În prezent nu există un abonament activ sau cumpărături în aplicație. Dacă vor fi introduse funcții contra cost, prețurile, perioada de facturare, reînnoirea, anularea, rambursările și termenii magazinului aplicabil vor fi afișați înainte de cumpărare. Vezi Informații despre abonamente din acest meniu." },
      { title: "Lege și litigii", body: "Protecțiile obligatorii ale consumatorilor din țara ta rămân disponibile. Operatorul trebuie să precizeze jurisdicția și o adresă reală de asistență înainte de lansarea publică. Contactează-ne mai întâi pentru a rezolva o problemă legată de serviciu." },
    ],
  },
  subscriptions: {
    title: "Informații despre abonamente",
    updated: "Informații înainte de lansare · 13 octombrie 2026",
    sections: [
      { title: "Situația actuală", body: "GoWorth nu vinde în prezent abonamente, nu percepe taxe pentru călătorii și nu oferă o perioadă de probă care se transformă automat într-un plan plătit. Această pagină conține informații pregătitoare, nu o ofertă de cumpărare." },
      { title: "Înainte de lansarea plăților", body: "Ecranul de cumpărare și termenii actualizați vor afișa beneficiile exacte ale planului, prețul total și moneda, taxele aplicabile, intervalul de facturare, condițiile de reînnoire și ale perioadei de probă, modalitatea de anulare, regulile de rambursare și furnizorul plăților. Cumpărarea va necesita o acțiune explicită. Accesul la funcțiile deja cumpărate și restaurarea cumpărăturilor vor fi disponibile acolo unde platforma impune acest lucru." },
      { title: "Facturarea prin magazinele de aplicații", body: "Dacă un abonament pentru iPhone sau Android este vândut printr-un magazin de aplicații, magazinul va gestiona facturarea și administrarea abonamentului. Nu le vom cere utilizatorilor să anuleze abonamentul doar prin ștergerea contului. Vom adăuga linkurile relevante pentru gestionare și restaurare înainte de activarea abonamentelor." },
    ],
  },
  credits: {
    title: "Licențe și atribuiri",
    updated: "15 octombrie 2026",
    sections: [
      { title: "Datele hărții", body: "Datele hărții provin de la colaboratorii OpenStreetMap și sunt disponibile sub Open Database License. Harta este furnizată de OpenFreeMap și afișată cu biblioteca open-source MapLibre GL JS. Căutarea pe hartă și unele locuri apropiate sunt furnizate de Photon din date OpenStreetMap. Atribuirea apare pe hartă și în acest meniu." },
      { title: "Locuri din Wikipedia", body: "Căutarea locurilor într-un oraș și unele atracții din apropiere folosesc titlurile și coordonatele articolelor Wikipedia. Fiecare rezultat trimite la articolul sursă. Textul Wikipedia reutilizat este, în general, sub licența CC BY-SA; GoWorth nu reproduce textul articolelor în descrierile locurilor." },
      { title: "Țări, state și orașe", body: "Indexul de țări, state americane și orașe este adaptat din GeoNames cities5000, countryInfo și admin1CodesASCII, sub licența CC BY 4.0. Include orașe peste pragul de populație al setului și centre administrative, nu toate localitățile. Sursă: geonames.org. Licență: creativecommons.org/licenses/by/4.0/." },
      { title: "Marcajele statelor SUA", body: "Punctele statelor de pe hartă provin din U.S. Census Bureau 2026 National States Gazetteer File. Ele identifică statele pentru navigare și nu reprezintă granițele acestora. Sursă: census.gov/geographies/reference-files/2026/geo/gazetter-file.html." },
      { title: "Fotografiile locurilor", body: "Imaginile destinațiilor sunt incluse în GoWorth, iar sursele lor sunt înregistrate în proiect. Fotografiile locurilor, când sunt disponibile, provin de la Wikimedia Commons. Deschide Detalii fotografie de lângă imagine pentru a vedea aici sursa, autorul și licența exactă. Termenii diferă de la o imagine la alta." },
      { title: "Navigație externă", body: "Când alegi Indicații, GoWorth deschide aplicația de hărți a dispozitivului sau o hartă web. Furnizorul primește coordonatele destinației și aplică propriile condiții de confidențialitate." },
    ],
  },
};
