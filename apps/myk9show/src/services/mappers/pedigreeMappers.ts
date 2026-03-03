// Pedigree ancestors data mappers - transform between database and application types
import type {
  DbPedigreeAncestor,
  DbPedigreeAncestorInsert,
  DbPedigreeAncestorUpdate,
} from '@/types/database-mappings';
import {
  isPedigreePosition,
  type PedigreeAncestor,
  type CreatePedigreeAncestorData,
  type UpdatePedigreeAncestorData,
  type RegistrationNumbers,
} from '@/types/pedigree-types';

function parseRegistrationNumbers(raw: unknown): RegistrationNumbers {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const result: RegistrationNumbers = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'string') result[k] = v;
    }
    return result;
  }
  return {};
}

function parseSex(value: string | null): 'male' | 'female' | null {
  if (value === 'male' || value === 'female') return value;
  return null;
}

export const mapDbPedigreeAncestorToApp = (db: DbPedigreeAncestor): PedigreeAncestor => {
  return {
    id: db.id,
    dog_id: db.dog_id,
    owner_id: db.owner_id,
    position: isPedigreePosition(db.position) ? db.position : 'sire',
    linked_dog_id: db.linked_dog_id,
    registered_name: db.registered_name,
    call_name: db.call_name,
    titles: db.titles,
    breed: db.breed,
    color: db.color,
    sex: parseSex(db.sex),
    date_of_birth: db.date_of_birth,
    photo_url: db.photo_url,
    registration_numbers: parseRegistrationNumbers(db.registration_numbers),
    health_info: db.health_info,
    created_at: db.created_at,
    updated_at: db.updated_at,
  };
};

export const mapAppPedigreeAncestorToDbInsert = (
  app: CreatePedigreeAncestorData
): DbPedigreeAncestorInsert => {
  return {
    dog_id: app.dog_id,
    owner_id: app.owner_id,
    position: app.position,
    linked_dog_id: app.linked_dog_id,
    registered_name: app.registered_name,
    call_name: app.call_name,
    titles: app.titles,
    breed: app.breed,
    color: app.color,
    sex: app.sex,
    date_of_birth: app.date_of_birth,
    photo_url: app.photo_url,
    registration_numbers: app.registration_numbers as Record<string, string>,
    health_info: app.health_info,
  };
};

export const mapAppPedigreeAncestorToDbUpdate = (
  app: UpdatePedigreeAncestorData
): DbPedigreeAncestorUpdate => {
  const update: DbPedigreeAncestorUpdate = {};

  if (app.position !== undefined) update.position = app.position;
  if (app.linked_dog_id !== undefined) update.linked_dog_id = app.linked_dog_id;
  if (app.registered_name !== undefined) update.registered_name = app.registered_name;
  if (app.call_name !== undefined) update.call_name = app.call_name;
  if (app.titles !== undefined) update.titles = app.titles;
  if (app.breed !== undefined) update.breed = app.breed;
  if (app.color !== undefined) update.color = app.color;
  if (app.sex !== undefined) update.sex = app.sex;
  if (app.date_of_birth !== undefined) update.date_of_birth = app.date_of_birth;
  if (app.photo_url !== undefined) update.photo_url = app.photo_url;
  if (app.registration_numbers !== undefined)
    update.registration_numbers = app.registration_numbers as Record<string, string>;
  if (app.health_info !== undefined) update.health_info = app.health_info;

  return update;
};
