# Page Role-Based Sidebar Permissions Guide

## Problem Fixed ✅

The previous code tried to fetch Page doctype directly from the frontend, which caused:
```
PermissionError: Insufficient Permission for Page
```

Regular users don't have permission to read the entire Page doctype.

## Solution: Whitelisted Server Method

Created a **secure whitelisted backend method** that:
1. Safely fetches all pages with proper permission checks
2. Reads the standard **Roles** child table from each page
3. Returns only the role restrictions
4. Frontend calls this method instead of directly querying the Page doctype

---

## How to Set Up Page Permissions

### Step 1: Open a Page Document

Example: `job-posting` page

```
Customize Form > Search "Page" > Click on Page doctype that shows in results
OR
Home > Build > Page > [page-name]
```

### Step 2: Add Roles to the "Roles" Table

In the **Roles** section, add the user roles that can access this page:

```
┌─────────────────────┐
│ No. │     Role      │
├─────┼───────────────┤
│  1  │ System Manager│
│  2  │ Administrator │
│  3  │ HR User       │
└─────┴───────────────┘
```

### Step 3: Understand the Logic

| Scenario | Result |
|----------|--------|
| **Roles table is EMPTY** | ✅ Page visible to **ALL** users |
| **Roles table has entries** | ✅ Page visible **ONLY** to users with those roles |
| **Admin user** | ✅ Always sees the page (regardless of roles) |

### Step 4: Save and Test

- Save the page
- The sidebar will automatically refresh in 1-2 seconds
- Users will see the page only if they have matching roles
- Users without matching roles will NOT see the page in sidebar

---

## Example: Job Posting Page

**Setup:**
```
Page: job-posting
Roles Table:
  - System Manager
  - Administrator  
  - HR User
```

**Result:**
- ✅ Users with role "System Manager" → SEE job-posting in sidebar
- ✅ Users with role "Administrator" → SEE job-posting in sidebar
- ✅ Users with role "HR User" → SEE job-posting in sidebar
- ❌ Sales Users → DO NOT see job-posting
- ❌ Tech Support Users → DO NOT see job-posting

---

## Example: Customers Page - Open to Everyone

**Setup:**
```
Page: customers
Roles Table: (EMPTY)
```

**Result:**
- ✅ ALL users see customers page in sidebar
- This includes: Sales Users, Tech Support, HR Users, everyone!

---

## How the Code Works

### Backend (Python - `renewal_module/api.py`):
```python
@frappe.whitelist()
def get_page_permissions():
    """
    Safe server method to fetch page role restrictions
    - Handles permission checks properly
    - Returns: {page_name: [role1, role2, ...]}
    """
    # Loops through all pages
    # Reads the 'roles' child table from each page
    # Returns only pages with role restrictions
```

### Frontend (JavaScript - `support_theme2.js`):
```javascript
// Calls server method (replaces direct query)
async function fetchPagePermissionsFromDoctype() {
    const response = await frappe.call({
        method: "renewal_module.api.get_page_permissions"
    });
    // Returns: {customers: [], tickets: ['Tech Support'], ...}
}

// Uses permissions to filter sidebar
function userCanAccessPage(pageId) {
    if (isAdmin) return true;  // Admins see everything
    
    const requiredRoles = pagePermissions[pageId];
    if (!requiredRoles) return true;  // No restriction = all users
    
    return requiredRoles.some(role => userHasRole(role));
}
```

---

## Common Questions

### Q: Why do users see a blank parent menu?
A: Because all child pages under that menu are hidden due to permission restrictions. This is correct behavior.

### Q: Can I leave the Roles table empty?
A: Yes! Empty = visible to all users. This is the fallback behavior.

### Q: Do Admins see everything?
A: Yes! Administrators always bypass role restrictions and see all pages.

### Q: What if I misspell a role name?
A: The permission won't work for that role. Double-check the role name exists in your system:
- Home > Roles > [Role name]

### Q: When do changes take effect?
A: Sidebar refresh happens automatically after 1-2 seconds. You can manually refresh:
- Press F5 or Ctrl+Shift+R (hard refresh)

---

## Troubleshooting

### No sidebar changes after saving page roles?

1. **Hard refresh the browser:**
   ```
   Ctrl+Shift+Del (Windows/Linux)
   Cmd+Shift+Delete (Mac)
   ```

2. **Clear browser cache:**
   - Dev Tools > Network tab > Disable cache (while DevTools open)
   - Refresh page

3. **Check browser console** (F12):
   - Look for error messages
   - Check if `get_page_permissions` is being called
   - Look for role matching logs

### User still sees pages they shouldn't?

1. Check if user has Administrator role (bypasses all restrictions)
2. Verify the role name in the Roles table matches system roles
3. Check the user's actual assigned roles: Home > User > [username] > Roles

### "Insufficient Permission for Page" error still appears?

1. Clear browser cache completely
2. Restart development server: `bench restart`
3. Verify the `get_page_permissions` method was saved in api.py

---

## Testing Checklist

- [ ] Open Page: customers (leave roles empty)
  - [ ] Test user sees "Customers" in sidebar
  
- [ ] Open Page: job-posting (add roles: System Manager, HR User)
  - [ ] System Manager user → sees job-posting ✅
  - [ ] HR User → sees job-posting ✅
  - [ ] Sales User → does NOT see job-posting ✅

- [ ] Test with Admin user
  - [ ] Admin sees ALL pages regardless of settings ✅

- [ ] Test nested menus
  - [ ] If all children hidden → parent also hidden ✅
  - [ ] If one child visible → parent stays open ✅

---

## API Reference

### Server Method (Python)
```
Method: renewal_module.api.get_page_permissions
Returns: 
{
    "page_name1": ["Role1", "Role2"],
    "page_name2": ["Role3"],
    ...
}
```

### JavaScript Integration
```javascript
// Call from any page
frappe.call({
    method: "renewal_module.api.get_page_permissions",
    callback: function(r) {
        console.log("Page permissions:", r.message);
    }
});
```
