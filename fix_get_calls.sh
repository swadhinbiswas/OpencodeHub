#!/bin/bash

# Fix admin/repositories.astro
sed -i 's/\.get(),$/,/g; s/countResult\.count/countResult?.[0]?.count/g' src/pages/admin/repositories.astro

# Fix admin/audit.astro  
sed -i 's/\.get(),$/,/g; s/countResult\.count/countResult?.[0]?.count/g' src/pages/admin/audit.astro

# Fix admin/users.astro
sed -i 's/\.get() as { count: number } | undefined,$/,/g' src/pages/admin/users.astro
sed -i 's/countResult\.count/countResult?.[0]?.count/g' src/pages/admin/users.astro

echo "Fixed .get() in admin files"
