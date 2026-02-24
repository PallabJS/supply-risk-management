export const INDIA_STATES: readonly string[] = Object.freeze([
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
]);

export const INDIA_MAJOR_CITIES: readonly string[] = Object.freeze([
  "Ahmedabad",
  "Amritsar",
  "Aurangabad",
  "Bengaluru",
  "Bhopal",
  "Bhubaneswar",
  "Chandigarh",
  "Chennai",
  "Coimbatore",
  "Cuttack",
  "Dehradun",
  "Delhi",
  "Dhanbad",
  "Faridabad",
  "Ghaziabad",
  "Gurugram",
  "Guwahati",
  "Hubli",
  "Hyderabad",
  "Indore",
  "Jaipur",
  "Jalandhar",
  "Jammu",
  "Jamnagar",
  "Jamshedpur",
  "Kanpur",
  "Kochi",
  "Kolkata",
  "Kozhikode",
  "Lucknow",
  "Ludhiana",
  "Madurai",
  "Mangaluru",
  "Meerut",
  "Mohali",
  "Mumbai",
  "Mysuru",
  "Nagpur",
  "Nashik",
  "Navi Mumbai",
  "Noida",
  "Patna",
  "Pimpri-Chinchwad",
  "Pune",
  "Raipur",
  "Rajkot",
  "Ranchi",
  "Srinagar",
  "Surat",
  "Thane",
  "Thiruvananthapuram",
  "Tiruchirappalli",
  "Udaipur",
  "Vadodara",
  "Varanasi",
  "Vijayawada",
  "Visakhapatnam",
]);

export const INDIA_LOGISTICS_NODES: readonly string[] = Object.freeze([
  "Bhiwandi",
  "JNPT",
  "Nhava Sheva",
  "Mundra",
  "Kandla",
  "Kochi Port",
  "Chennai Port",
  "Ennore",
  "Vishakhapatnam Port",
  "Paradip",
  "Tuticorin",
]);

export const INDIA_GEO_KEYWORDS: readonly string[] = Object.freeze(
  Array.from(
    new Set(
      [...INDIA_STATES, ...INDIA_MAJOR_CITIES, ...INDIA_LOGISTICS_NODES, "India"]
        .map((value) => value.toLowerCase()),
    ),
  ),
);

interface AliasEntry {
  canonical: string;
  terms: readonly string[];
}

const GEO_SCOPE_ALIASES: readonly AliasEntry[] = Object.freeze([
  { canonical: "Mumbai", terms: ["mumbai", "navi mumbai", "thane", "bhiwandi", "jnpt", "nhava sheva"] },
  { canonical: "Bangalore", terms: ["bangalore", "bengaluru", "hosur", "tumkur"] },
  { canonical: "Maharashtra", terms: ["maharashtra", "pune", "nagpur", "nashik"] },
  { canonical: "Karnataka", terms: ["karnataka", "mysuru", "mangaluru", "hubli"] },
  { canonical: "Delhi", terms: ["new delhi", "delhi", "gurugram", "noida", "ghaziabad"] },
  { canonical: "Tamil Nadu", terms: ["tamil nadu", "chennai", "coimbatore", "tiruchirappalli"] },
  { canonical: "Gujarat", terms: ["gujarat", "ahmedabad", "surat", "vadodara", "mundra", "kandla"] },
  { canonical: "West Bengal", terms: ["west bengal", "kolkata"] },
  { canonical: "Telangana", terms: ["telangana", "hyderabad"] },
  { canonical: "Uttar Pradesh", terms: ["uttar pradesh", "lucknow", "kanpur", "varanasi", "meerut"] },
]);

export function inferIndiaGeographicScopeFromText(text: string): string {
  const normalized = text.toLowerCase();

  for (const alias of GEO_SCOPE_ALIASES) {
    if (alias.terms.some((term) => normalized.includes(term))) {
      return alias.canonical;
    }
  }

  for (const state of INDIA_STATES) {
    if (normalized.includes(state.toLowerCase())) {
      return state;
    }
  }

  for (const city of INDIA_MAJOR_CITIES) {
    if (normalized.includes(city.toLowerCase())) {
      return city;
    }
  }

  if (normalized.includes("india")) {
    return "India";
  }

  return "India";
}
