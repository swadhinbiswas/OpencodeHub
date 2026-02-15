
import os
import re

def fix_astro_files(directory):
    # Regex to find capitalized tags with class attribute
    # Group 1: Opening tag and attributes before class
    # Group 2: The class value
    # Group 3: Attributes after class
    
    # Pattern explanation:
    # <([A-Z][\w\.]+)   : Match <TagName where TagName starts with UpperCase (Component)
    # [^>]*?            : non-greedy match of anything before class
    # \bclass=          : match class= word boundary
    pattern = re.compile(r'(<[A-Z][\w\.]+(?:\s+[^>]*?)?)\bclass=(["\'][^"\']*["\'])')

    for root, dirs, files in os.walk(directory):
        for file in files:
            if file.endswith(".astro"):
                filepath = os.path.join(root, file)
                with open(filepath, 'r') as f:
                    content = f.read()
                
                # Function to pass to re.sub to handle the replacement safely
                def replace_match(match):
                    # Reconstruct correctly using className
                    return f'{match.group(1)}className={match.group(2)}'
                
                new_content = pattern.sub(replace_match, content)
                
                # Run it again to catch multiple class attributes or complex cases? 
                # The regex matches one instance. We might need to iterate if there are multiple uppercase tags on one line or multiple class attributes (unlikely).
                # Actually re.sub replaces ALL non-overlapping occurrences.
                
                if new_content != content:
                    print(f"Fixing {filepath}")
                    with open(filepath, 'w') as f:
                        f.write(new_content)

fix_astro_files("/home/swadhin/owngit/OpenCodeHub/src/pages")
fix_astro_files("/home/swadhin/owngit/OpenCodeHub/src/components")
