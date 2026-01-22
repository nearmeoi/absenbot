const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { USERS_FILE } = require('../src/config/constants');

function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')        // Replace spaces with -
        .replace(/[^\w\-]+/g, '')    // Remove all non-word chars
        .replace(/\-\-+/g, '-');     // Replace multiple - with single -
}

function generateSlugs() {
    console.log(chalk.blue('Generating User Slugs...'));
    
    try {
        const users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
        let updatedCount = 0;
        const usedSlugs = new Set();

        users.forEach(user => {
            // Base the slug on the name if available, otherwise email username
            let base = user.name || user.email.split('@')[0];
            let slug = slugify(base);

            // Ensure uniqueness
            let counter = 1;
            let originalSlug = slug;
            while (usedSlugs.has(slug)) {
                slug = `${originalSlug}-${counter}`;
                counter++;
            }
            usedSlugs.add(slug);

            if (user.slug !== slug) {
                user.slug = slug;
                console.log(chalk.green(`✨ Slug: "${user.name || user.email}" -> "${slug}"`));
                updatedCount++;
            }
        });

        if (updatedCount > 0) {
            fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
            console.log(chalk.blue(`Done! Generated slugs for ${updatedCount} users.`));
        } else {
            console.log(chalk.yellow('All users already have slugs.'));
        }

    } catch (e) {
        console.error(chalk.red('Error generating slugs:'), e.message);
    }
}

generateSlugs();
