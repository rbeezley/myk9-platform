// Breed and variety data by organization
// This data structure supports organization-specific breeds with their varieties

export interface BreedInfo {
  name: string;
  varieties: string[];
  group?: string;
}

export interface OrganizationBreeds {
  [organization: string]: BreedInfo[];
}

// AKC Breeds with varieties
// Source: American Kennel Club official breed list
export const AKC_BREEDS: BreedInfo[] = [
  // Sporting Group
  { name: 'American Water Spaniel', varieties: [], group: 'Sporting' },
  { name: 'Boykin Spaniel', varieties: [], group: 'Sporting' },
  { name: 'Brittany', varieties: [], group: 'Sporting' },
  { name: 'Chesapeake Bay Retriever', varieties: [], group: 'Sporting' },
  { name: 'Clumber Spaniel', varieties: [], group: 'Sporting' },
  { name: 'Cocker Spaniel', varieties: ['Black', 'ASCOB', 'Parti-Color'], group: 'Sporting' },
  { name: 'Curly-Coated Retriever', varieties: [], group: 'Sporting' },
  { name: 'English Cocker Spaniel', varieties: [], group: 'Sporting' },
  { name: 'English Setter', varieties: [], group: 'Sporting' },
  { name: 'English Springer Spaniel', varieties: [], group: 'Sporting' },
  { name: 'Field Spaniel', varieties: [], group: 'Sporting' },
  { name: 'Flat-Coated Retriever', varieties: [], group: 'Sporting' },
  { name: 'German Shorthaired Pointer', varieties: [], group: 'Sporting' },
  { name: 'German Wirehaired Pointer', varieties: [], group: 'Sporting' },
  { name: 'Golden Retriever', varieties: [], group: 'Sporting' },
  { name: 'Gordon Setter', varieties: [], group: 'Sporting' },
  { name: 'Irish Red and White Setter', varieties: [], group: 'Sporting' },
  { name: 'Irish Setter', varieties: [], group: 'Sporting' },
  { name: 'Irish Water Spaniel', varieties: [], group: 'Sporting' },
  { name: 'Labrador Retriever', varieties: [], group: 'Sporting' },
  { name: 'Lagotto Romagnolo', varieties: [], group: 'Sporting' },
  { name: 'Nederlandse Kooikerhondje', varieties: [], group: 'Sporting' },
  { name: 'Nova Scotia Duck Tolling Retriever', varieties: [], group: 'Sporting' },
  { name: 'Pointer', varieties: [], group: 'Sporting' },
  { name: 'Spinone Italiano', varieties: [], group: 'Sporting' },
  { name: 'Sussex Spaniel', varieties: [], group: 'Sporting' },
  { name: 'Vizsla', varieties: [], group: 'Sporting' },
  { name: 'Weimaraner', varieties: [], group: 'Sporting' },
  { name: 'Welsh Springer Spaniel', varieties: [], group: 'Sporting' },
  { name: 'Wirehaired Pointing Griffon', varieties: [], group: 'Sporting' },
  { name: 'Wirehaired Vizsla', varieties: [], group: 'Sporting' },

  // Hound Group
  { name: 'Afghan Hound', varieties: [], group: 'Hound' },
  { name: 'American English Coonhound', varieties: [], group: 'Hound' },
  { name: 'American Foxhound', varieties: [], group: 'Hound' },
  { name: 'Azawakh', varieties: [], group: 'Hound' },
  { name: 'Basenji', varieties: [], group: 'Hound' },
  { name: 'Basset Hound', varieties: [], group: 'Hound' },
  { name: 'Beagle', varieties: ['13 Inch', '15 Inch'], group: 'Hound' },
  { name: 'Black and Tan Coonhound', varieties: [], group: 'Hound' },
  { name: 'Bloodhound', varieties: [], group: 'Hound' },
  { name: 'Bluetick Coonhound', varieties: [], group: 'Hound' },
  { name: 'Borzoi', varieties: [], group: 'Hound' },
  { name: 'Cirneco dell\'Etna', varieties: [], group: 'Hound' },
  { name: 'Dachshund', varieties: ['Longhaired', 'Smooth', 'Wirehaired'], group: 'Hound' },
  { name: 'English Foxhound', varieties: [], group: 'Hound' },
  { name: 'Grand Basset Griffon Vendéen', varieties: [], group: 'Hound' },
  { name: 'Greyhound', varieties: [], group: 'Hound' },
  { name: 'Harrier', varieties: [], group: 'Hound' },
  { name: 'Ibizan Hound', varieties: [], group: 'Hound' },
  { name: 'Irish Wolfhound', varieties: [], group: 'Hound' },
  { name: 'Norwegian Elkhound', varieties: [], group: 'Hound' },
  { name: 'Otterhound', varieties: [], group: 'Hound' },
  { name: 'Petit Basset Griffon Vendéen', varieties: [], group: 'Hound' },
  { name: 'Pharaoh Hound', varieties: [], group: 'Hound' },
  { name: 'Plott Hound', varieties: [], group: 'Hound' },
  { name: 'Portuguese Podengo Pequeno', varieties: [], group: 'Hound' },
  { name: 'Redbone Coonhound', varieties: [], group: 'Hound' },
  { name: 'Rhodesian Ridgeback', varieties: [], group: 'Hound' },
  { name: 'Saluki', varieties: [], group: 'Hound' },
  { name: 'Scottish Deerhound', varieties: [], group: 'Hound' },
  { name: 'Sloughi', varieties: [], group: 'Hound' },
  { name: 'Treeing Walker Coonhound', varieties: [], group: 'Hound' },
  { name: 'Whippet', varieties: [], group: 'Hound' },

  // Working Group
  { name: 'Akita', varieties: [], group: 'Working' },
  { name: 'Alaskan Malamute', varieties: [], group: 'Working' },
  { name: 'Anatolian Shepherd Dog', varieties: [], group: 'Working' },
  { name: 'Bernese Mountain Dog', varieties: [], group: 'Working' },
  { name: 'Black Russian Terrier', varieties: [], group: 'Working' },
  { name: 'Boerboel', varieties: [], group: 'Working' },
  { name: 'Boxer', varieties: [], group: 'Working' },
  { name: 'Bullmastiff', varieties: [], group: 'Working' },
  { name: 'Cane Corso', varieties: [], group: 'Working' },
  { name: 'Chinook', varieties: [], group: 'Working' },
  { name: 'Doberman Pinscher', varieties: [], group: 'Working' },
  { name: 'Dogo Argentino', varieties: [], group: 'Working' },
  { name: 'Dogue de Bordeaux', varieties: [], group: 'Working' },
  { name: 'German Pinscher', varieties: [], group: 'Working' },
  { name: 'Giant Schnauzer', varieties: [], group: 'Working' },
  { name: 'Great Dane', varieties: [], group: 'Working' },
  { name: 'Great Pyrenees', varieties: [], group: 'Working' },
  { name: 'Greater Swiss Mountain Dog', varieties: [], group: 'Working' },
  { name: 'Komondor', varieties: [], group: 'Working' },
  { name: 'Kuvasz', varieties: [], group: 'Working' },
  { name: 'Leonberger', varieties: [], group: 'Working' },
  { name: 'Mastiff', varieties: [], group: 'Working' },
  { name: 'Neapolitan Mastiff', varieties: [], group: 'Working' },
  { name: 'Newfoundland', varieties: [], group: 'Working' },
  { name: 'Portuguese Water Dog', varieties: [], group: 'Working' },
  { name: 'Rottweiler', varieties: [], group: 'Working' },
  { name: 'Saint Bernard', varieties: [], group: 'Working' },
  { name: 'Samoyed', varieties: [], group: 'Working' },
  { name: 'Siberian Husky', varieties: [], group: 'Working' },
  { name: 'Standard Schnauzer', varieties: [], group: 'Working' },
  { name: 'Tibetan Mastiff', varieties: [], group: 'Working' },

  // Terrier Group
  { name: 'Airedale Terrier', varieties: [], group: 'Terrier' },
  { name: 'American Hairless Terrier', varieties: [], group: 'Terrier' },
  { name: 'American Staffordshire Terrier', varieties: [], group: 'Terrier' },
  { name: 'Australian Terrier', varieties: [], group: 'Terrier' },
  { name: 'Bedlington Terrier', varieties: [], group: 'Terrier' },
  { name: 'Border Terrier', varieties: [], group: 'Terrier' },
  { name: 'Bull Terrier', varieties: ['Standard', 'Miniature'], group: 'Terrier' },
  { name: 'Cairn Terrier', varieties: [], group: 'Terrier' },
  { name: 'Cesky Terrier', varieties: [], group: 'Terrier' },
  { name: 'Dandie Dinmont Terrier', varieties: [], group: 'Terrier' },
  { name: 'Glen of Imaal Terrier', varieties: [], group: 'Terrier' },
  { name: 'Irish Terrier', varieties: [], group: 'Terrier' },
  { name: 'Kerry Blue Terrier', varieties: [], group: 'Terrier' },
  { name: 'Lakeland Terrier', varieties: [], group: 'Terrier' },
  { name: 'Manchester Terrier', varieties: ['Standard', 'Toy'], group: 'Terrier' },
  { name: 'Miniature Bull Terrier', varieties: [], group: 'Terrier' },
  { name: 'Miniature Schnauzer', varieties: [], group: 'Terrier' },
  { name: 'Norfolk Terrier', varieties: [], group: 'Terrier' },
  { name: 'Norwich Terrier', varieties: [], group: 'Terrier' },
  { name: 'Parson Russell Terrier', varieties: [], group: 'Terrier' },
  { name: 'Rat Terrier', varieties: [], group: 'Terrier' },
  { name: 'Russell Terrier', varieties: [], group: 'Terrier' },
  { name: 'Scottish Terrier', varieties: [], group: 'Terrier' },
  { name: 'Sealyham Terrier', varieties: [], group: 'Terrier' },
  { name: 'Skye Terrier', varieties: [], group: 'Terrier' },
  { name: 'Smooth Fox Terrier', varieties: [], group: 'Terrier' },
  { name: 'Soft Coated Wheaten Terrier', varieties: [], group: 'Terrier' },
  { name: 'Staffordshire Bull Terrier', varieties: [], group: 'Terrier' },
  { name: 'Welsh Terrier', varieties: [], group: 'Terrier' },
  { name: 'West Highland White Terrier', varieties: [], group: 'Terrier' },
  { name: 'Wire Fox Terrier', varieties: [], group: 'Terrier' },

  // Toy Group
  { name: 'Affenpinscher', varieties: [], group: 'Toy' },
  { name: 'Biewer Terrier', varieties: [], group: 'Toy' },
  { name: 'Brussels Griffon', varieties: [], group: 'Toy' },
  { name: 'Cavalier King Charles Spaniel', varieties: [], group: 'Toy' },
  { name: 'Chihuahua', varieties: ['Long Coat', 'Smooth Coat'], group: 'Toy' },
  { name: 'Chinese Crested', varieties: ['Hairless', 'Powderpuff'], group: 'Toy' },
  { name: 'English Toy Spaniel', varieties: ['Blenheim & Prince Charles', 'King Charles & Ruby'], group: 'Toy' },
  { name: 'Havanese', varieties: [], group: 'Toy' },
  { name: 'Italian Greyhound', varieties: [], group: 'Toy' },
  { name: 'Japanese Chin', varieties: [], group: 'Toy' },
  { name: 'Maltese', varieties: [], group: 'Toy' },
  { name: 'Manchester Terrier (Toy)', varieties: [], group: 'Toy' },
  { name: 'Miniature Pinscher', varieties: [], group: 'Toy' },
  { name: 'Papillon', varieties: [], group: 'Toy' },
  { name: 'Pekingese', varieties: [], group: 'Toy' },
  { name: 'Pomeranian', varieties: [], group: 'Toy' },
  { name: 'Poodle (Toy)', varieties: [], group: 'Toy' },
  { name: 'Pug', varieties: [], group: 'Toy' },
  { name: 'Russian Toy', varieties: [], group: 'Toy' },
  { name: 'Shih Tzu', varieties: [], group: 'Toy' },
  { name: 'Silky Terrier', varieties: [], group: 'Toy' },
  { name: 'Toy Fox Terrier', varieties: [], group: 'Toy' },
  { name: 'Yorkshire Terrier', varieties: [], group: 'Toy' },

  // Non-Sporting Group
  { name: 'American Eskimo Dog', varieties: ['Standard', 'Miniature', 'Toy'], group: 'Non-Sporting' },
  { name: 'Bichon Frise', varieties: [], group: 'Non-Sporting' },
  { name: 'Boston Terrier', varieties: [], group: 'Non-Sporting' },
  { name: 'Bulldog', varieties: [], group: 'Non-Sporting' },
  { name: 'Chinese Shar-Pei', varieties: [], group: 'Non-Sporting' },
  { name: 'Chow Chow', varieties: [], group: 'Non-Sporting' },
  { name: 'Coton de Tulear', varieties: [], group: 'Non-Sporting' },
  { name: 'Dalmatian', varieties: [], group: 'Non-Sporting' },
  { name: 'Finnish Spitz', varieties: [], group: 'Non-Sporting' },
  { name: 'French Bulldog', varieties: [], group: 'Non-Sporting' },
  { name: 'Keeshond', varieties: [], group: 'Non-Sporting' },
  { name: 'Lhasa Apso', varieties: [], group: 'Non-Sporting' },
  { name: 'Lowchen', varieties: [], group: 'Non-Sporting' },
  { name: 'Norwegian Lundehund', varieties: [], group: 'Non-Sporting' },
  { name: 'Poodle (Miniature)', varieties: [], group: 'Non-Sporting' },
  { name: 'Poodle (Standard)', varieties: [], group: 'Non-Sporting' },
  { name: 'Schipperke', varieties: [], group: 'Non-Sporting' },
  { name: 'Shiba Inu', varieties: [], group: 'Non-Sporting' },
  { name: 'Tibetan Spaniel', varieties: [], group: 'Non-Sporting' },
  { name: 'Tibetan Terrier', varieties: [], group: 'Non-Sporting' },
  { name: 'Xoloitzcuintli', varieties: ['Standard', 'Miniature', 'Toy'], group: 'Non-Sporting' },

  // Herding Group
  { name: 'Australian Cattle Dog', varieties: [], group: 'Herding' },
  { name: 'Australian Shepherd', varieties: [], group: 'Herding' },
  { name: 'Bearded Collie', varieties: [], group: 'Herding' },
  { name: 'Beauceron', varieties: [], group: 'Herding' },
  { name: 'Belgian Laekenois', varieties: [], group: 'Herding' },
  { name: 'Belgian Malinois', varieties: [], group: 'Herding' },
  { name: 'Belgian Sheepdog', varieties: [], group: 'Herding' },
  { name: 'Belgian Tervuren', varieties: [], group: 'Herding' },
  { name: 'Bergamasco Sheepdog', varieties: [], group: 'Herding' },
  { name: 'Berger Picard', varieties: [], group: 'Herding' },
  { name: 'Border Collie', varieties: [], group: 'Herding' },
  { name: 'Bouvier des Flandres', varieties: [], group: 'Herding' },
  { name: 'Briard', varieties: [], group: 'Herding' },
  { name: 'Canaan Dog', varieties: [], group: 'Herding' },
  { name: 'Cardigan Welsh Corgi', varieties: [], group: 'Herding' },
  { name: 'Collie', varieties: ['Rough', 'Smooth'], group: 'Herding' },
  { name: 'Dutch Shepherd', varieties: ['Short Hair', 'Long Hair', 'Wire Hair'], group: 'Herding' },
  { name: 'Entlebucher Mountain Dog', varieties: [], group: 'Herding' },
  { name: 'Finnish Lapphund', varieties: [], group: 'Herding' },
  { name: 'German Shepherd Dog', varieties: [], group: 'Herding' },
  { name: 'Icelandic Sheepdog', varieties: [], group: 'Herding' },
  { name: 'Miniature American Shepherd', varieties: [], group: 'Herding' },
  { name: 'Mudi', varieties: [], group: 'Herding' },
  { name: 'Norwegian Buhund', varieties: [], group: 'Herding' },
  { name: 'Old English Sheepdog', varieties: [], group: 'Herding' },
  { name: 'Pembroke Welsh Corgi', varieties: [], group: 'Herding' },
  { name: 'Polish Lowland Sheepdog', varieties: [], group: 'Herding' },
  { name: 'Puli', varieties: [], group: 'Herding' },
  { name: 'Pumi', varieties: [], group: 'Herding' },
  { name: 'Pyrenean Shepherd', varieties: ['Rough-Faced', 'Smooth-Faced'], group: 'Herding' },
  { name: 'Shetland Sheepdog', varieties: [], group: 'Herding' },
  { name: 'Spanish Water Dog', varieties: [], group: 'Herding' },
  { name: 'Swedish Vallhund', varieties: [], group: 'Herding' },

  // Miscellaneous Class / FSS (Foundation Stock Service)
  { name: 'All American Dog', varieties: [], group: 'Mixed Breed' },
  { name: 'Mixed Breed', varieties: [], group: 'Mixed Breed' },
];

// UKC Breeds - Complete list organized by UKC's 8 breed groups
// Source: United Kennel Club official breed list
export const UKC_BREEDS: BreedInfo[] = [
  // Guardian Dogs Group
  { name: 'Akbash Dog', varieties: [], group: 'Guardian Dog' },
  { name: 'Akita', varieties: [], group: 'Guardian Dog' },
  { name: 'Alapaha Blue Blood Bulldog', varieties: [], group: 'Guardian Dog' },
  { name: 'American Bulldog', varieties: [], group: 'Guardian Dog' },
  { name: 'Anatolian Shepherd Dog', varieties: [], group: 'Guardian Dog' },
  { name: 'Black Russian Terrier', varieties: [], group: 'Guardian Dog' },
  { name: 'Boerboel', varieties: [], group: 'Guardian Dog' },
  { name: 'Boxer', varieties: [], group: 'Guardian Dog' },
  { name: 'Bullmastiff', varieties: [], group: 'Guardian Dog' },
  { name: 'Cane Corso', varieties: [], group: 'Guardian Dog' },
  { name: 'Caucasian Ovcharka', varieties: [], group: 'Guardian Dog' },
  { name: 'Central Asian Shepherd Dog', varieties: [], group: 'Guardian Dog' },
  { name: 'Doberman Pinscher', varieties: [], group: 'Guardian Dog' },
  { name: 'Dogo Argentino', varieties: [], group: 'Guardian Dog' },
  { name: 'Dogue de Bordeaux', varieties: [], group: 'Guardian Dog' },
  { name: 'Fila Brasileiro', varieties: [], group: 'Guardian Dog' },
  { name: 'German Pinscher', varieties: [], group: 'Guardian Dog' },
  { name: 'Giant Schnauzer', varieties: [], group: 'Guardian Dog' },
  { name: 'Great Dane', varieties: [], group: 'Guardian Dog' },
  { name: 'Great Pyrenees', varieties: [], group: 'Guardian Dog' },
  { name: 'Greater Swiss Mountain Dog', varieties: [], group: 'Guardian Dog' },
  { name: 'Komondor', varieties: [], group: 'Guardian Dog' },
  { name: 'Kuvasz', varieties: [], group: 'Guardian Dog' },
  { name: 'Leonberger', varieties: [], group: 'Guardian Dog' },
  { name: 'Mastiff', varieties: [], group: 'Guardian Dog' },
  { name: 'Neapolitan Mastiff', varieties: [], group: 'Guardian Dog' },
  { name: 'Newfoundland', varieties: [], group: 'Guardian Dog' },
  { name: 'Presa Canario', varieties: [], group: 'Guardian Dog' },
  { name: 'Rottweiler', varieties: [], group: 'Guardian Dog' },
  { name: 'Saint Bernard', varieties: [], group: 'Guardian Dog' },
  { name: 'Spanish Mastiff', varieties: [], group: 'Guardian Dog' },
  { name: 'Standard Schnauzer', varieties: [], group: 'Guardian Dog' },
  { name: 'Tibetan Mastiff', varieties: [], group: 'Guardian Dog' },
  { name: 'Tosa', varieties: [], group: 'Guardian Dog' },

  // Scenthounds Group
  { name: 'American English Coonhound', varieties: [], group: 'Scenthound' },
  { name: 'American Foxhound', varieties: [], group: 'Scenthound' },
  { name: 'American Leopard Hound', varieties: [], group: 'Scenthound' },
  { name: 'Basset Hound', varieties: [], group: 'Scenthound' },
  { name: 'Beagle', varieties: ['13 Inch', '15 Inch'], group: 'Scenthound' },
  { name: 'Black and Tan Coonhound', varieties: [], group: 'Scenthound' },
  { name: 'Black Mouth Cur', varieties: [], group: 'Scenthound' },
  { name: 'Bloodhound', varieties: [], group: 'Scenthound' },
  { name: 'Bluetick Coonhound', varieties: [], group: 'Scenthound' },
  { name: 'Catahoula Leopard Dog', varieties: [], group: 'Scenthound' },
  { name: 'Dachshund', varieties: ['Longhaired', 'Smooth', 'Wirehaired'], group: 'Scenthound' },
  { name: 'English Foxhound', varieties: [], group: 'Scenthound' },
  { name: 'Grand Bleu de Gascogne', varieties: [], group: 'Scenthound' },
  { name: 'Harrier', varieties: [], group: 'Scenthound' },
  { name: 'Mountain Cur', varieties: [], group: 'Scenthound' },
  { name: 'Otterhound', varieties: [], group: 'Scenthound' },
  { name: 'Petit Basset Griffon Vendéen', varieties: [], group: 'Scenthound' },
  { name: 'Plott Hound', varieties: [], group: 'Scenthound' },
  { name: 'Redbone Coonhound', varieties: [], group: 'Scenthound' },
  { name: 'Stephens Cur', varieties: [], group: 'Scenthound' },
  { name: 'Treeing Cur', varieties: [], group: 'Scenthound' },
  { name: 'Treeing Tennessee Brindle', varieties: [], group: 'Scenthound' },
  { name: 'Treeing Walker Coonhound', varieties: [], group: 'Scenthound' },

  // Sighthounds & Pariah Dogs Group
  { name: 'Afghan Hound', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Azawakh', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Basenji', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Borzoi', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Canaan Dog', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Carolina Dog', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Cirneco dell\'Etna', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Greyhound', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Ibizan Hound', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Irish Wolfhound', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Italian Greyhound', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'New Guinea Singing Dog', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Peruvian Inca Orchid', varieties: ['Small', 'Medium', 'Large'], group: 'Sighthound & Pariah Dog' },
  { name: 'Pharaoh Hound', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Portuguese Podengo', varieties: ['Small', 'Medium', 'Large'], group: 'Sighthound & Pariah Dog' },
  { name: 'Rhodesian Ridgeback', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Saluki', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Scottish Deerhound', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Sloughi', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Thai Ridgeback', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Whippet', varieties: [], group: 'Sighthound & Pariah Dog' },
  { name: 'Xoloitzcuintli', varieties: ['Standard', 'Miniature', 'Toy'], group: 'Sighthound & Pariah Dog' },

  // Gun Dogs Group
  { name: 'American Water Spaniel', varieties: [], group: 'Gun Dog' },
  { name: 'Boykin Spaniel', varieties: [], group: 'Gun Dog' },
  { name: 'Brittany', varieties: [], group: 'Gun Dog' },
  { name: 'Chesapeake Bay Retriever', varieties: [], group: 'Gun Dog' },
  { name: 'Clumber Spaniel', varieties: [], group: 'Gun Dog' },
  { name: 'Cocker Spaniel', varieties: ['Black', 'ASCOB', 'Parti-Color'], group: 'Gun Dog' },
  { name: 'Curly-Coated Retriever', varieties: [], group: 'Gun Dog' },
  { name: 'English Cocker Spaniel', varieties: [], group: 'Gun Dog' },
  { name: 'English Pointer', varieties: [], group: 'Gun Dog' },
  { name: 'English Setter', varieties: [], group: 'Gun Dog' },
  { name: 'English Springer Spaniel', varieties: [], group: 'Gun Dog' },
  { name: 'Field Spaniel', varieties: [], group: 'Gun Dog' },
  { name: 'Flat-Coated Retriever', varieties: [], group: 'Gun Dog' },
  { name: 'German Longhaired Pointer', varieties: [], group: 'Gun Dog' },
  { name: 'German Shorthaired Pointer', varieties: [], group: 'Gun Dog' },
  { name: 'German Wirehaired Pointer', varieties: [], group: 'Gun Dog' },
  { name: 'Golden Retriever', varieties: [], group: 'Gun Dog' },
  { name: 'Gordon Setter', varieties: [], group: 'Gun Dog' },
  { name: 'Irish Red and White Setter', varieties: [], group: 'Gun Dog' },
  { name: 'Irish Setter', varieties: [], group: 'Gun Dog' },
  { name: 'Irish Water Spaniel', varieties: [], group: 'Gun Dog' },
  { name: 'Labrador Retriever', varieties: [], group: 'Gun Dog' },
  { name: 'Lagotto Romagnolo', varieties: [], group: 'Gun Dog' },
  { name: 'Nova Scotia Duck Tolling Retriever', varieties: [], group: 'Gun Dog' },
  { name: 'Spinone Italiano', varieties: [], group: 'Gun Dog' },
  { name: 'Sussex Spaniel', varieties: [], group: 'Gun Dog' },
  { name: 'Vizsla', varieties: [], group: 'Gun Dog' },
  { name: 'Weimaraner', varieties: [], group: 'Gun Dog' },
  { name: 'Welsh Springer Spaniel', varieties: [], group: 'Gun Dog' },
  { name: 'Wirehaired Pointing Griffon', varieties: [], group: 'Gun Dog' },
  { name: 'Wirehaired Vizsla', varieties: [], group: 'Gun Dog' },

  // Northern Breeds Group
  { name: 'Alaskan Klee Kai', varieties: ['Standard', 'Miniature', 'Toy'], group: 'Northern Breed' },
  { name: 'Alaskan Malamute', varieties: [], group: 'Northern Breed' },
  { name: 'American Eskimo Dog', varieties: ['Standard', 'Miniature', 'Toy'], group: 'Northern Breed' },
  { name: 'Chinook', varieties: [], group: 'Northern Breed' },
  { name: 'Chow Chow', varieties: [], group: 'Northern Breed' },
  { name: 'Eurasier', varieties: [], group: 'Northern Breed' },
  { name: 'Finnish Lapphund', varieties: [], group: 'Northern Breed' },
  { name: 'Finnish Spitz', varieties: [], group: 'Northern Breed' },
  { name: 'German Spitz', varieties: ['Giant', 'Medium', 'Miniature'], group: 'Northern Breed' },
  { name: 'Icelandic Sheepdog', varieties: [], group: 'Northern Breed' },
  { name: 'Kai Ken', varieties: [], group: 'Northern Breed' },
  { name: 'Keeshond', varieties: [], group: 'Northern Breed' },
  { name: 'Kishu Ken', varieties: [], group: 'Northern Breed' },
  { name: 'Norwegian Buhund', varieties: [], group: 'Northern Breed' },
  { name: 'Norwegian Elkhound', varieties: [], group: 'Northern Breed' },
  { name: 'Norwegian Lundehund', varieties: [], group: 'Northern Breed' },
  { name: 'Pomeranian', varieties: [], group: 'Northern Breed' },
  { name: 'Samoyed', varieties: [], group: 'Northern Breed' },
  { name: 'Schipperke', varieties: [], group: 'Northern Breed' },
  { name: 'Shiba Inu', varieties: [], group: 'Northern Breed' },
  { name: 'Shikoku', varieties: [], group: 'Northern Breed' },
  { name: 'Siberian Husky', varieties: [], group: 'Northern Breed' },
  { name: 'Swedish Vallhund', varieties: [], group: 'Northern Breed' },

  // Herding Dogs Group
  { name: 'Australian Cattle Dog', varieties: [], group: 'Herding Dog' },
  { name: 'Australian Kelpie', varieties: [], group: 'Herding Dog' },
  { name: 'Australian Shepherd', varieties: [], group: 'Herding Dog' },
  { name: 'Bearded Collie', varieties: [], group: 'Herding Dog' },
  { name: 'Beauceron', varieties: [], group: 'Herding Dog' },
  { name: 'Belgian Malinois', varieties: [], group: 'Herding Dog' },
  { name: 'Belgian Sheepdog', varieties: [], group: 'Herding Dog' },
  { name: 'Belgian Tervuren', varieties: [], group: 'Herding Dog' },
  { name: 'Bergamasco Sheepdog', varieties: [], group: 'Herding Dog' },
  { name: 'Border Collie', varieties: [], group: 'Herding Dog' },
  { name: 'Bouvier des Flandres', varieties: [], group: 'Herding Dog' },
  { name: 'Briard', varieties: [], group: 'Herding Dog' },
  { name: 'Cardigan Welsh Corgi', varieties: [], group: 'Herding Dog' },
  { name: 'Collie', varieties: ['Rough', 'Smooth'], group: 'Herding Dog' },
  { name: 'Dutch Shepherd', varieties: ['Short Hair', 'Long Hair', 'Wire Hair'], group: 'Herding Dog' },
  { name: 'English Shepherd', varieties: [], group: 'Herding Dog' },
  { name: 'Entlebucher Mountain Dog', varieties: [], group: 'Herding Dog' },
  { name: 'German Shepherd Dog', varieties: [], group: 'Herding Dog' },
  { name: 'Miniature American Shepherd', varieties: [], group: 'Herding Dog' },
  { name: 'Mudi', varieties: [], group: 'Herding Dog' },
  { name: 'Old English Sheepdog', varieties: [], group: 'Herding Dog' },
  { name: 'Pembroke Welsh Corgi', varieties: [], group: 'Herding Dog' },
  { name: 'Polish Lowland Sheepdog', varieties: [], group: 'Herding Dog' },
  { name: 'Puli', varieties: [], group: 'Herding Dog' },
  { name: 'Pumi', varieties: [], group: 'Herding Dog' },
  { name: 'Pyrenean Shepherd', varieties: ['Rough-Faced', 'Smooth-Faced'], group: 'Herding Dog' },
  { name: 'Shetland Sheepdog', varieties: [], group: 'Herding Dog' },
  { name: 'Spanish Water Dog', varieties: [], group: 'Herding Dog' },
  { name: 'White Swiss Shepherd Dog', varieties: [], group: 'Herding Dog' },

  // Terriers Group
  { name: 'Airedale Terrier', varieties: [], group: 'Terrier' },
  { name: 'American Hairless Terrier', varieties: [], group: 'Terrier' },
  { name: 'American Pit Bull Terrier', varieties: [], group: 'Terrier' },
  { name: 'American Staffordshire Terrier', varieties: [], group: 'Terrier' },
  { name: 'Australian Terrier', varieties: [], group: 'Terrier' },
  { name: 'Bedlington Terrier', varieties: [], group: 'Terrier' },
  { name: 'Border Terrier', varieties: [], group: 'Terrier' },
  { name: 'Bull Terrier', varieties: ['Standard', 'Miniature'], group: 'Terrier' },
  { name: 'Cairn Terrier', varieties: [], group: 'Terrier' },
  { name: 'Dandie Dinmont Terrier', varieties: [], group: 'Terrier' },
  { name: 'Glen of Imaal Terrier', varieties: [], group: 'Terrier' },
  { name: 'Irish Terrier', varieties: [], group: 'Terrier' },
  { name: 'Jack Russell Terrier', varieties: [], group: 'Terrier' },
  { name: 'Kerry Blue Terrier', varieties: [], group: 'Terrier' },
  { name: 'Lakeland Terrier', varieties: [], group: 'Terrier' },
  { name: 'Manchester Terrier', varieties: ['Standard', 'Toy'], group: 'Terrier' },
  { name: 'Miniature Bull Terrier', varieties: [], group: 'Terrier' },
  { name: 'Miniature Schnauzer', varieties: [], group: 'Terrier' },
  { name: 'Norfolk Terrier', varieties: [], group: 'Terrier' },
  { name: 'Norwich Terrier', varieties: [], group: 'Terrier' },
  { name: 'Parson Russell Terrier', varieties: [], group: 'Terrier' },
  { name: 'Rat Terrier', varieties: [], group: 'Terrier' },
  { name: 'Russell Terrier', varieties: [], group: 'Terrier' },
  { name: 'Scottish Terrier', varieties: [], group: 'Terrier' },
  { name: 'Sealyham Terrier', varieties: [], group: 'Terrier' },
  { name: 'Skye Terrier', varieties: [], group: 'Terrier' },
  { name: 'Smooth Fox Terrier', varieties: [], group: 'Terrier' },
  { name: 'Soft Coated Wheaten Terrier', varieties: [], group: 'Terrier' },
  { name: 'Staffordshire Bull Terrier', varieties: [], group: 'Terrier' },
  { name: 'Teddy Roosevelt Terrier', varieties: [], group: 'Terrier' },
  { name: 'Toy Fox Terrier', varieties: [], group: 'Terrier' },
  { name: 'Welsh Terrier', varieties: [], group: 'Terrier' },
  { name: 'West Highland White Terrier', varieties: [], group: 'Terrier' },
  { name: 'Wire Fox Terrier', varieties: [], group: 'Terrier' },

  // Companion Dogs Group
  { name: 'Affenpinscher', varieties: [], group: 'Companion Dog' },
  { name: 'Bichon Frise', varieties: [], group: 'Companion Dog' },
  { name: 'Bolognese', varieties: [], group: 'Companion Dog' },
  { name: 'Boston Terrier', varieties: [], group: 'Companion Dog' },
  { name: 'Brussels Griffon', varieties: [], group: 'Companion Dog' },
  { name: 'Cavalier King Charles Spaniel', varieties: [], group: 'Companion Dog' },
  { name: 'Chihuahua', varieties: ['Long Coat', 'Smooth Coat'], group: 'Companion Dog' },
  { name: 'Chinese Crested', varieties: ['Hairless', 'Powderpuff'], group: 'Companion Dog' },
  { name: 'Coton de Tulear', varieties: [], group: 'Companion Dog' },
  { name: 'Dalmatian', varieties: [], group: 'Companion Dog' },
  { name: 'English Bulldog', varieties: [], group: 'Companion Dog' },
  { name: 'English Toy Spaniel', varieties: ['Blenheim & Prince Charles', 'King Charles & Ruby'], group: 'Companion Dog' },
  { name: 'French Bulldog', varieties: [], group: 'Companion Dog' },
  { name: 'Havanese', varieties: [], group: 'Companion Dog' },
  { name: 'Japanese Chin', varieties: [], group: 'Companion Dog' },
  { name: 'Lhasa Apso', varieties: [], group: 'Companion Dog' },
  { name: 'Lowchen', varieties: [], group: 'Companion Dog' },
  { name: 'Maltese', varieties: [], group: 'Companion Dog' },
  { name: 'Miniature Pinscher', varieties: [], group: 'Companion Dog' },
  { name: 'Papillon', varieties: [], group: 'Companion Dog' },
  { name: 'Pekingese', varieties: [], group: 'Companion Dog' },
  { name: 'Poodle', varieties: ['Standard', 'Miniature', 'Toy'], group: 'Companion Dog' },
  { name: 'Portuguese Water Dog', varieties: [], group: 'Companion Dog' },
  { name: 'Pug', varieties: [], group: 'Companion Dog' },
  { name: 'Chinese Shar-Pei', varieties: [], group: 'Companion Dog' },
  { name: 'Shih Tzu', varieties: [], group: 'Companion Dog' },
  { name: 'Silky Terrier', varieties: [], group: 'Companion Dog' },
  { name: 'Tibetan Spaniel', varieties: [], group: 'Companion Dog' },
  { name: 'Tibetan Terrier', varieties: [], group: 'Companion Dog' },
  { name: 'Yorkshire Terrier', varieties: [], group: 'Companion Dog' },
];

// CKC (Canadian Kennel Club) - similar to AKC
export const CKC_BREEDS: BreedInfo[] = [
  ...AKC_BREEDS,
  { name: 'Nova Scotia Duck Tolling Retriever', varieties: [], group: 'Sporting' },
];

// FCI Breeds - International, includes most breeds
export const FCI_BREEDS: BreedInfo[] = [
  ...AKC_BREEDS,
  // Additional FCI breeds not in AKC
  { name: 'Argentinian Dogo', varieties: [], group: 'Working' },
  { name: 'Australian Kelpie', varieties: [], group: 'Herding' },
  { name: 'Barbet', varieties: [], group: 'Sporting' },
  { name: 'Bolognese', varieties: [], group: 'Toy' },
  { name: 'Croatian Sheepdog', varieties: [], group: 'Herding' },
  { name: 'Dutch Shepherd', varieties: ['Short Hair', 'Long Hair', 'Wire Hair'], group: 'Herding' },
  { name: 'Eurasier', varieties: [], group: 'Non-Sporting' },
  { name: 'German Spitz', varieties: ['Giant', 'Medium', 'Miniature'], group: 'Non-Sporting' },
  { name: 'Hovawart', varieties: [], group: 'Working' },
  { name: 'Kai Ken', varieties: [], group: 'Non-Sporting' },
  { name: 'Kishu Ken', varieties: [], group: 'Non-Sporting' },
  { name: 'Peruvian Inca Orchid', varieties: ['Small', 'Medium', 'Large'], group: 'Sighthound' },
  { name: 'Shikoku', varieties: [], group: 'Non-Sporting' },
  { name: 'Thai Ridgeback', varieties: [], group: 'Sighthound' },
  { name: 'White Swiss Shepherd Dog', varieties: [], group: 'Herding' },
];

// KC (UK Kennel Club) breeds
export const KC_BREEDS: BreedInfo[] = [
  ...AKC_BREEDS,
  // UK-specific variations
  { name: 'English Setter', varieties: [], group: 'Gundog' },
  { name: 'Gordon Setter', varieties: [], group: 'Gundog' },
  { name: 'Irish Setter', varieties: [], group: 'Gundog' },
];

// Organization to breeds mapping
export const ORGANIZATION_BREEDS: OrganizationBreeds = {
  'AKC': AKC_BREEDS,
  'UKC': UKC_BREEDS,
  'CKC': CKC_BREEDS,
  'FCI': FCI_BREEDS,
  'KC': KC_BREEDS,
  'Other': AKC_BREEDS, // Default to AKC for "Other"
};

// Helper function to get breeds for an organization
export function getBreedsForOrganization(organization: string): BreedInfo[] {
  return ORGANIZATION_BREEDS[organization] || AKC_BREEDS;
}

// Helper function to get varieties for a breed in an organization
export function getVarietiesForBreed(organization: string, breedName: string): string[] {
  const breeds = getBreedsForOrganization(organization);
  const breed = breeds.find(b => b.name === breedName);
  return breed?.varieties || [];
}

// Helper function to get sorted breed names for an organization
export function getBreedNamesForOrganization(organization: string): string[] {
  const breeds = getBreedsForOrganization(organization);
  return breeds.map(b => b.name).sort((a, b) => a.localeCompare(b));
}

// Helper function to check if a breed has varieties
export function breedHasVarieties(organization: string, breedName: string): boolean {
  const varieties = getVarietiesForBreed(organization, breedName);
  return varieties.length > 0;
}

// Helper function to get the group for a breed
export function getGroupForBreed(organization: string, breedName: string): string | undefined {
  const breeds = getBreedsForOrganization(organization);
  const breed = breeds.find(b => b.name === breedName);
  return breed?.group;
}

// Helper function to get all unique groups for an organization
export function getGroupsForOrganization(organization: string): string[] {
  const breeds = getBreedsForOrganization(organization);
  const groups = new Set(breeds.map(b => b.group).filter((g): g is string => !!g));
  return Array.from(groups).sort((a, b) => a.localeCompare(b));
}

// Helper function to get breeds by group for an organization
export function getBreedsByGroup(organization: string, group: string): BreedInfo[] {
  const breeds = getBreedsForOrganization(organization);
  return breeds.filter(b => b.group === group);
}

// Organization group definitions for reference
export const AKC_GROUPS = [
  'Sporting',
  'Hound',
  'Working',
  'Terrier',
  'Toy',
  'Non-Sporting',
  'Herding',
  'Mixed Breed',
] as const;

export const UKC_GROUPS = [
  'Guardian Dog',
  'Scenthound',
  'Sighthound & Pariah Dog',
  'Gun Dog',
  'Northern Breed',
  'Herding Dog',
  'Terrier',
  'Companion Dog',
] as const;

export type AKCGroup = typeof AKC_GROUPS[number];
export type UKCGroup = typeof UKC_GROUPS[number];
