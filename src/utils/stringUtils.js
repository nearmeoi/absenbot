/**
 * Calculate Levenshtein Distance between two strings
 * Using iterative matrix approach for stability
 */
function levenshteinDistance(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1  // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
}

/**
 * Find the closest match from a list of candidates
 * @param {string} target 
 * @param {string[]} candidates 
 * @param {number} threshold - Max distance allowed (default 3)
 * @returns {string|null} closest match or null
 */
function findClosestMatch(target, candidates, threshold = 3) {
    let closest = null;
    let minDistance = Infinity;

    for (const candidate of candidates) {
        const distance = levenshteinDistance(target, candidate);
        if (distance < minDistance) {
            minDistance = distance;
            closest = candidate;
        }
    }

    if (minDistance <= threshold) {
        return closest;
    }
    return null;
}

module.exports = {
    levenshteinDistance,
    findClosestMatch
};
