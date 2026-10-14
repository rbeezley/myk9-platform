export {
  EMPTY_DOG_IDENTITY,
  normalizeOrganization,
  registrationMatchesOrganization,
  resolveDogIdentity,
  resolveDogIdentityForOrganization,
  toDogRegistrationLike,
} from './resolveDogIdentity';
export type {
  DogIdentity,
  DogRegistrationLike,
  MappedDogRegistrationLike,
} from './resolveDogIdentity';
export {
  isAwaitingRegistrationNumber,
  isConformationPuppyClass,
  registrationsFromRead,
  registrationsIfKnown,
} from './isAwaitingRegistrationNumber';
export type {
  ConformationPuppyContext,
  DogRegistrationsSource,
} from './isAwaitingRegistrationNumber';
