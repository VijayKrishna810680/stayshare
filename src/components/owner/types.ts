/** Plain serialisable shapes passed from server pages to owner client components. */
export type Option = { id: string; name: string };
export type CityOpt = { id: string; name: string; state: string; code: string; latitude: number | null; longitude: number | null };
export type LocalityOpt = { id: string; name: string; cityId: string };
export type FacilityOpt = { id: string; name: string; category: string; isCustom: boolean; active: boolean };

export type PropertyMeta = {
  cities: CityOpt[];
  localities: LocalityOpt[];
  propertyTypes: Option[];
  facilities: FacilityOpt[];
};

export type PropertyInfo = {
  id?: string;
  approvalStatus?: string;
  name: string;
  propertyTypeId: string;
  description: string;
  genderEligibility: string;
  targetAudience: string[];
  addressLine: string;
  landmark: string | null;
  cityId: string;
  localityId: string | null;
  state: string;
  postalCode: string;
  latitude: number | null;
  longitude: number | null;
  checkInTime: string;
  checkOutTime: string;
  minStayNights: number;
  maxStayNights: number;
  idProofRequired: boolean;
  instantBooking: boolean;
  allowCashAtProperty: boolean;
  foodIncluded: boolean;
  contactPhone: string | null;
  showOwnerPhone: boolean;
};

export type ImageItem = { id: string; url: string; caption: string | null; isCover?: boolean; status: string; sortOrder: number };
export type DocItem = { id: string; docType: string; fileId: string; status: string; notes: string | null; createdAt: string };
