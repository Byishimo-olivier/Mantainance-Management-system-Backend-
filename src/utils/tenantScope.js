// Company (tenant) scoping helpers.
//
// Superadmins operate the whole platform and must see every company's data,
// even if their own account happens to carry a companyName.

const NO_COMPANY_MATCH = '__no_company__';

const isSuperAdmin = (user) => ['superadmin', 'super-admin'].includes(String(user?.role || '').toLowerCase());

// Company name to filter a query by:
//  - superadmin            -> '' (no filter: every company)
//  - user with a company   -> that company
//  - user without company  -> a value that matches no records
const scopeCompanyFor = (user) => {
  if (isSuperAdmin(user)) return '';
  const companyName = String(user?.companyName || '').trim();
  return companyName || NO_COMPANY_MATCH;
};

module.exports = { isSuperAdmin, scopeCompanyFor, NO_COMPANY_MATCH };
