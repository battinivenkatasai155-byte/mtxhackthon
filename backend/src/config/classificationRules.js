const rules = [
  { code: 'WATER', category: 'water_supply', terms: ['water supply', 'drinking water', 'water contamination', 'contaminated water', 'leak', 'pipeline', 'water pipe', 'sewage'] },
  { code: 'ROADS', category: 'road_infrastructure', terms: ['pothole', 'road damage', 'broken road', 'street light', 'footpath', 'road repair', 'bridge'] },
  { code: 'ELECTRICITY', category: 'electricity', terms: ['power cut', 'power outage', 'electricity', 'transformer', 'electric pole', 'voltage'] },
  { code: 'MUNICIPAL', category: 'municipal_services', terms: ['garbage', 'waste collection', 'drainage', 'sewer', 'street cleaning', 'municipal'] },
  { code: 'HEALTH', category: 'public_health', terms: ['hospital', 'clinic', 'health center', 'medicine', 'public health', 'disease outbreak'] },
  { code: 'POLICE', category: 'public_safety', terms: ['police', 'theft', 'assault', 'harassment', 'public safety', 'crime'] },
  { code: 'TRANSPORT', category: 'transport', terms: ['bus service', 'bus route', 'public transport', 'traffic signal', 'transport', 'rto'] },
  { code: 'REVENUE', category: 'revenue_and_land', terms: ['land record', 'property record', 'revenue office', 'land dispute', 'mutation'] },
  { code: 'EDUCATION', category: 'education', terms: ['school', 'teacher', 'education', 'classroom', 'midday meal'] }
];

const crossDepartmentRules = [
  {
    matches: (text) => /water|drinking|contaminat/.test(text) && /pipe|pipeline|burst|damaged|leak/.test(text),
    primary: 'WATER',
    secondary: 'MUNICIPAL',
    reason: 'Water supply and damaged municipal pipe infrastructure are both mentioned.'
  },
  {
    matches: (text) => /road|pothole|street/.test(text) && /electric|power|pole|transformer/.test(text),
    primary: 'ROADS',
    secondary: 'ELECTRICITY',
    reason: 'The report describes a road issue and an electricity asset or outage.'
  },
  {
    matches: (text) => /sewage|drain|waste|garbage/.test(text) && /illness|disease|contaminat|health/.test(text),
    primary: 'MUNICIPAL',
    secondary: 'HEALTH',
    reason: 'A municipal sanitation issue is described alongside a possible public-health impact.'
  }
];

module.exports = { rules, crossDepartmentRules };
