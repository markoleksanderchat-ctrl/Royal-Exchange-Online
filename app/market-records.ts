import type { ListedCompany } from "../lib/market";

const CHARTER_SEATS: Record<string, string> = {
  STPL: "The Staple court at Calais",
  MRCR: "Mercery hall near West Chepe",
  PEPR: "Soper Lane counting house",
  FISH: "The riverside fish market",
  IRON: "Ironmonger Lane",
  GDSM: "The goldsmiths' quarter at West Chepe",
  WAXC: "Candlewick Street",
  SKIN: "St Mary Axe",
  CORD: "Cordwainer Street",
  MSON: "Eastcheap stone yard",
  CARP: "The workshops by London Wall",
  JOIN: "Aldersgate",
  COOP: "Thames Street",
  GLAZ: "The Southwark glass yard",
  BRIK: "The Aldgate tile yard",
  DYER: "Walbrook",
  HABD: "West Chepe",
  BOWY: "Wood Street",
  FLET: "St Mary Axe",
  CUTL: "Pope's Head Alley",
  ARMR: "Coleman Street",
  APOT: "Bucklersbury",
  BAKR: "Bread Street",
  BUTR: "Monkwell Street",
  POUL: "Poultry Market",
  FRUT: "Gracechurch Market",
  SALT: "Queenhithe",
  SHIP: "Ratcliff riverside yard",
  SCRV: "Chancery Lane",
  HORN: "London Bridge",
  LORN: "Basinghall Street",
  FOND: "Lothbury",
  ADVT: "The York merchants' hall",
  WIRE: "Blanch Appleton",
  MUSC: "Bishopsgate",
  GARD: "Coleman Street",
  COLL: "The Newcastle coal quay",
  UPHL: "Cornhill",
};

const SECTOR_NOTES: Record<string, string> = {
  "Staple Trade": "Wardens inspect staple wares before they enter the Crown market.",
  Textiles: "Mercers record cloth by quality, measure and place of origin.",
  Provisions: "Clerks watch quay receipts and the condition of stored provisions.",
  Victuals: "Freshness, river access and daily supply govern the victualling price.",
  Metals: "Weight, workmanship and furnace supply shape the quoted reference.",
  Bullion: "Assay, fineness and scarcity guide the market's bullion entry.",
  Lighting: "Wax stores and household demand govern the chandlers' account.",
  Peltry: "Hides and worked skins are entered by condition and scarcity.",
  Leatherwork: "Finished leather wares are judged by material and workmanship.",
  Building: "Cartage, quarry supply and public works influence the masonry account.",
  Timber: "Species, seasoning and transport determine the timber quotation.",
  Joinery: "Finished wooden fittings follow the carpenter and timber markets.",
  Containers: "Storage wares follow timber, iron fittings and river trade.",
  Glass: "Fuel, sand and skilled furnace work shape the glasshouse price.",
  Ceramics: "Kiln fuel and clay supply govern tiles, brick and pottery.",
  Colour: "Pigment scarcity and cloth demand move the dyers' market.",
  Smallwares: "Many small necessities are gathered into one haberdashers' account.",
  Arms: "Material supply and skilled workmanship govern arms and missiles.",
  Tools: "Metal prices and workshop demand shape the cutlers' quotation.",
  Armour: "Plate, fittings and smithing work determine the armourers' market.",
  Brewing: "Rare reagents and brewing demand produce a volatile account.",
  Food: "Harvests, livestock supply and daily consumption guide the food market.",
  Horticulture: "Season, harvest and market arrivals govern garden produce.",
  "Marine Wares": "Quay arrivals and distant gathering grounds move marine wares.",
  Transport: "Timber, river access and freight demand shape the shipwrights' account.",
  "Books and Maps": "Paper, copying work and rare knowledge guide the scriveners' price.",
  "Animal Wares": "Scarcity and condition govern worked horn, shell and trophy wares.",
  "Horse Gear": "Leather, metal fittings and stable demand shape the loriners' account.",
  Mechanisms: "Metal supply and complex workshop labour govern mechanical wares.",
  "Foreign Wares": "Distance, danger and uncertain supply make foreign wares volatile.",
  Redstone: "Specialized mechanisms and scarce components drive this technical market.",
  Music: "Rare recordings and crafted instruments govern the minstrels' account.",
  Plants: "Season, rarity and cultivation shape the gardeners' market.",
  Fuel: "Mine output, transport and furnace demand govern fuel prices.",
  Furnishings: "Household demand and skilled finishing guide the upholders' quotation.",
};

export const PRICE_BOOK_SUGGESTIONS = ["wool", "redstone", "music discs", "maps", "potions", "diamonds"];

export function charterRecord(company: ListedCompany) {
  return {
    seat: CHARTER_SEATS[company.ticker] ?? "The Guildhall market precinct",
    register: `RXC-${company.ticker}`,
    note: SECTOR_NOTES[company.sector] ?? "Supply, workmanship and market demand govern this account.",
  };
}

export function standingFor(company: ListedCompany) {
  if (company.changePercent > 0.25) return "Rising in the present session";
  if (company.changePercent < -0.25) return "Easing in the present session";
  return "Holding near the session account";
}
