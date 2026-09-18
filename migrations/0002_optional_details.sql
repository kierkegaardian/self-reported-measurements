ALTER TABLE entries ADD COLUMN circumcision TEXT CHECK(circumcision IN ('circumcised', 'uncircumcised', 'partial'));
ALTER TABLE entries ADD COLUMN flaccidLength REAL CHECK(flaccidLength > 0);
ALTER TABLE entries ADD COLUMN flaccidGirth REAL CHECK(flaccidGirth > 0);
