'use strict';

/**
 * Deterministic seeded pseudo-random number generator (Mulberry32).
 * Same seed always produces the same sequence.
 */
function mulberry32(a) {
  return function () {
    a |= 0;
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function seededRandom(seed) {
  const rng = mulberry32(seed);
  return {
    next: () => rng(),
    nextInt: (min, max) => Math.floor(rng() * (max - min + 1)) + min,
    nextFloat: (min, max) => min + rng() * (max - min),
  };
}

function randomInt(min, max, rng) {
  return rng.nextInt(min, max);
}

function randomChoice(arr, rng) {
  return arr[rng.nextInt(0, arr.length - 1)];
}

function randomString(length, rng) {
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars[rng.nextInt(0, chars.length - 1)];
  }
  return result;
}

const FIRST_NAMES = [
  'James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda',
  'David', 'Elizabeth', 'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica',
  'Thomas', 'Sarah', 'Charles', 'Karen', 'Christopher', 'Lisa', 'Daniel', 'Nancy',
  'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra', 'Donald', 'Ashley',
  'Steven', 'Dorothy', 'Paul', 'Kimberly', 'Andrew', 'Emily', 'Joshua', 'Donna',
  'Kenneth', 'Michelle', 'Kevin', 'Carol', 'Brian', 'Amanda', 'George', 'Melissa',
  'Edward', 'Deborah', 'Ronald', 'Stephanie', 'Timothy', 'Rebecca', 'Jason', 'Sharon',
  'Jeffrey', 'Laura', 'Ryan', 'Cynthia', 'Jacob', 'Kathleen', 'Gary', 'Amy',
  'Nicholas', 'Angela', 'Eric', 'Shirley', 'Jonathan', 'Anna', 'Stephen', 'Brenda',
  'Larry', 'Pamela', 'Justin', 'Emma', 'Scott', 'Nicole', 'Brandon', 'Helen',
  'Benjamin', 'Samantha', 'Samuel', 'Katherine', 'Raymond', 'Christine', 'Gregory', 'Debra',
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill',
  'Flores', 'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell',
  'Mitchell', 'Carter', 'Roberts', 'Phillips', 'Evans', 'Turner', 'Parker', 'Collins',
  'Edwards', 'Stewart', 'Flores', 'Morris', 'Murphy', 'Cook', 'Rogers', 'Morgan',
  'Peterson', 'Cooper', 'Reed', 'Bailey', 'Bell', 'Gomez', 'Kelly', 'Howard',
  'Ward', 'Cox', 'Diaz', 'Richardson', 'Wood', 'Watson', 'Brooks', 'Bennett',
  'Gray', 'James', 'Reyes', 'Cruz', 'Hughes', 'Price', 'Myers', 'Long',
  'Foster', 'Sanders', 'Ross', 'Powell', 'Chen', 'Patterson', 'Hughes', 'Flores',
];

function randomName(rng, index) {
  const firstName = FIRST_NAMES[(index * 7 + rng.nextInt(0, FIRST_NAMES.length)) % FIRST_NAMES.length];
  const lastName = LAST_NAMES[(index * 13 + rng.nextInt(0, LAST_NAMES.length)) % LAST_NAMES.length];
  return `${firstName} ${lastName}`;
}

function randomEmail(rng, index) {
  const first = FIRST_NAMES[(index * 7 + rng.nextInt(0, FIRST_NAMES.length)) % FIRST_NAMES.length].toLowerCase();
  const last = LAST_NAMES[(index * 13 + rng.nextInt(0, LAST_NAMES.length)) % LAST_NAMES.length].toLowerCase();
  const domains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'example.com'];
  const domain = randomChoice(domains, rng);
  const num = index > 0 ? `${rng.nextInt(1, 999)}` : '';
  return `${first}.${last}${num}@${domain}`;
}

function randomPhone(rng, index) {
  const area = ['077', '078', '079', '074', '075'][rng.nextInt(0, 4)];
  const rest = String(rng.nextInt(100000, 999999)).padStart(6, '0');
  return `+44${area}${rest}`;
}

function randomAddress(rng) {
  const streets = [
    'High Street', 'Main Road', 'Church Lane', 'Park Avenue', 'Bridge Street',
    'Market Square', 'Victoria Road', 'King Street', 'Queen Street', 'Station Road',
    'Oak Road', 'Elm Street', 'Chestnut Avenue', 'Broadway', 'The Mall',
  ];
  const cities = [
    'London', 'Birmingham', 'Manchester', 'Leeds', 'Sheffield',
    'Liverpool', 'Bristol', 'Glasgow', 'Cardiff', 'Edinburgh',
  ];
  const streetNum = rng.nextInt(1, 250);
  const street = randomChoice(streets, rng);
  const city = randomChoice(cities, rng);
  const postcodes = ['EC1A', 'W1A', 'M1', 'L1', 'S1', 'B1', 'BS1', 'G1', 'CF1', 'EH1'];
  const postcode = `${randomChoice(postcodes, rng)} ${String(rng.nextInt(1, 99)).padStart(2, '0')}${randomChoice(['AA', 'BB', 'CC', 'DD', 'EE'], rng)}`;
  return `${streetNum} ${street}, ${city}, ${postcode}`;
}

module.exports = {
  mulberry32,
  seededRandom,
  randomInt,
  randomChoice,
  randomString,
  randomName,
  randomEmail,
  randomPhone,
  randomAddress,
  FIRST_NAMES,
  LAST_NAMES,
};
