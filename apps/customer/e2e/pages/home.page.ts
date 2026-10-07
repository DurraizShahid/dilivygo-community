import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Home Page Object Model
 * Handles restaurant browsing, filtering, and search functionality
 */
export class HomePage extends BasePage {
  protected readonly path = '/';

  // Search
  readonly searchInput: Locator;
  readonly searchResults: Locator;

  // Category filters
  readonly categoryFilter: Locator;
  readonly allCategoryButton: Locator;

  // Advanced filters
  readonly advancedFiltersSection: Locator;
  readonly sortBySelect: Locator;
  readonly priceRangeSelect: Locator;
  readonly maxDeliveryTimeSelect: Locator;
  readonly maxMinOrderSelect: Locator;
  readonly minRatingSelect: Locator;
  readonly maxDistanceSelect: Locator;
  readonly clearFiltersButton: Locator;

  // Cuisine filter buttons
  readonly cuisineFilterButtons: Locator;

  // Dietary preference buttons
  readonly dietaryFilterButtons: Locator;

  // Restaurant grid
  readonly restaurantGrid: Locator;
  readonly restaurantCards: Locator;
  readonly restaurantCardLinks: Locator;

  // Loading and empty states
  readonly loadingSkeleton: Locator;
  readonly emptyState: Locator;
  readonly restaurantCount: Locator;

  // Location
  readonly locationWarning: Locator;

  constructor(page: Page) {
    super(page);

    // Search
    this.searchInput = page.getByPlaceholder(/search/i);
    this.searchResults = page.locator('[data-testid="search-results"]');

    // Category filter
    this.categoryFilter = page.locator('section').filter({ hasText: /restaurants/i }).first();
    this.allCategoryButton = page.getByRole('button', { name: 'All', exact: true });

    // Advanced filters
    this.advancedFiltersSection = page.locator('text=Advanced Filters').locator('..');
    this.sortBySelect = page.locator('select').filter({ hasText: /relevance/i }).first();
    this.priceRangeSelect = page.locator('label').filter({ hasText: /price range/i }).locator('select');
    this.maxDeliveryTimeSelect = page.locator('label').filter({ hasText: /max delivery time/i }).locator('select');
    this.maxMinOrderSelect = page.locator('label').filter({ hasText: /max minimum order/i }).locator('select');
    this.minRatingSelect = page.locator('label').filter({ hasText: /minimum rating/i }).locator('select');
    this.maxDistanceSelect = page.locator('label').filter({ hasText: /max distance/i }).locator('select');
    this.clearFiltersButton = page.getByRole('button', { name: /clear filters/i });

    // Cuisine and dietary
    this.cuisineFilterButtons = page.locator('text=Cuisine type').locator('..').locator('button');
    this.dietaryFilterButtons = page.locator('text=Dietary preferences').locator('..').locator('button');

    // Restaurant grid
    this.restaurantGrid = page.locator('.grid').filter({ has: page.locator('[href*="/restaurant/"]') });
    this.restaurantCards = page.locator('a[href*="/restaurant/"]').filter({ has: page.locator('img').or(page.locator('svg')) });
    this.restaurantCardLinks = page.locator('a[href*="/restaurant/"]');

    // States
    this.loadingSkeleton = page.locator('.animate-pulse, [class*="skeleton"]').first();
    this.emptyState = page.locator('text=No restaurants found').locator('..');
    this.restaurantCount = page.locator('text=/\\d+ place/');

    // Location
    this.locationWarning = page.locator('text=Enable location access').locator('..');
  }

  /**
   * Wait for home page to load
   */
  async waitForPageLoad(): Promise<void> {
    await this.page.waitForLoadState('domcontentloaded');
    // Wait for either restaurants to load or empty state
    await Promise.race([
      this.restaurantCards.first().waitFor({ state: 'visible', timeout: 15_000 }),
      this.emptyState.waitFor({ state: 'visible', timeout: 15_000 }),
      this.loadingSkeleton.waitFor({ state: 'hidden', timeout: 15_000 }),
    ]).catch(() => {});
  }

  /**
   * Wait for restaurants to load
   */
  async waitForRestaurantsToLoad(): Promise<void> {
    // Wait for skeleton to disappear
    await this.loadingSkeleton.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});
  }

  /**
   * Search for restaurants
   */
  async search(query: string): Promise<void> {
    await this.searchInput.fill(query);
    // Wait for search to trigger and results to load
    await this.waitForRestaurantsToLoad();
  }

  /**
   * Clear search
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.clear();
    // Wait for restaurants to reload
    await this.waitForRestaurantsToLoad();
  }

  /**
   * Select a cuisine category from the main filter
   */
  async selectCategory(categoryName: string): Promise<void> {
    const categoryButton = this.page.getByRole('button', { name: categoryName, exact: true });
    await categoryButton.click();
    await this.waitForRestaurantsToLoad();
  }

  /**
   * Select all categories
   */
  async selectAllCategories(): Promise<void> {
    await this.allCategoryButton.click();
    await this.waitForRestaurantsToLoad();
  }

  /**
   * Set sort option
   */
  async setSortBy(option: 'relevance' | 'distance' | 'rating' | 'delivery_time' | 'min_order' | 'name'): Promise<void> {
    await this.sortBySelect.selectOption(option);
    await this.waitForRestaurantsToLoad();
  }

  /**
   * Set price range filter
   */
  async setPriceRange(range: 'all' | 'budget' | 'mid' | 'premium'): Promise<void> {
    await this.priceRangeSelect.selectOption(range);
    await this.waitForRestaurantsToLoad();
  }

  /**
   * Set max delivery time filter
   */
  async setMaxDeliveryTime(minutes: 'all' | '20' | '30' | '45' | '60'): Promise<void> {
    await this.maxDeliveryTimeSelect.selectOption(minutes);
    await this.waitForRestaurantsToLoad();
  }

  /**
   * Set minimum rating filter
   */
  async setMinRating(rating: 'all' | '4.0' | '4.3' | '4.5'): Promise<void> {
    await this.minRatingSelect.selectOption(rating);
    await this.waitForRestaurantsToLoad();
  }

  /**
   * Toggle cuisine filter
   */
  async toggleCuisineFilter(cuisineName: string): Promise<void> {
    const cuisineButton = this.cuisineFilterButtons.filter({ hasText: cuisineName }).first();
    await cuisineButton.click();
    await this.waitForRestaurantsToLoad();
  }

  /**
   * Toggle dietary preference filter
   */
  async toggleDietaryFilter(dietaryName: string): Promise<void> {
    const dietaryButton = this.dietaryFilterButtons.filter({ hasText: dietaryName }).first();
    await dietaryButton.click();
    await this.waitForRestaurantsToLoad();
  }

  /**
   * Clear all advanced filters
   */
  async clearAdvancedFilters(): Promise<void> {
    if (await this.clearFiltersButton.isVisible()) {
      await this.clearFiltersButton.click();
      await this.waitForRestaurantsToLoad();
    }
  }

  /**
   * Get count of displayed restaurants
   */
  async getRestaurantCount(): Promise<number> {
    return await this.restaurantCardLinks.count();
  }

  /**
   * Get restaurant names
   */
  async getRestaurantNames(): Promise<string[]> {
    const cards = await this.restaurantCardLinks.all();
    const names: string[] = [];
    for (const card of cards) {
      const name = await card.locator('h3, .font-semibold').first().textContent();
      if (name) names.push(name.trim());
    }
    return names;
  }

  /**
   * Click on a restaurant by name
   */
  async clickRestaurant(name: string): Promise<void> {
    const card = this.restaurantCardLinks.filter({ hasText: name }).first();
    await card.click();
    await this.page.waitForURL(/\/restaurant\//);
  }

  /**
   * Click on first available restaurant
   */
  async clickFirstRestaurant(): Promise<void> {
    await this.restaurantCardLinks.first().click();
    await this.page.waitForURL(/\/restaurant\//);
  }

  /**
   * Check if empty state is shown
   */
  async isEmptyStateVisible(): Promise<boolean> {
    return await this.emptyState.isVisible();
  }

  /**
   * Check if restaurants are displayed
   */
  async hasRestaurants(): Promise<boolean> {
    const count = await this.restaurantCardLinks.count();
    return count > 0;
  }

  /**
   * Get displayed restaurant count text
   */
  async getDisplayedCountText(): Promise<string | null> {
    try {
      return await this.restaurantCount.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Verify search results contain query
   */
  async verifySearchResultsContain(query: string): Promise<void> {
    const names = await this.getRestaurantNames();
    const lowerQuery = query.toLowerCase();
    const hasMatch = names.some(name => name.toLowerCase().includes(lowerQuery));
    expect(hasMatch).toBeTruthy();
  }

  /**
   * Check if location warning is visible
   */
  async isLocationWarningVisible(): Promise<boolean> {
    return await this.locationWarning.isVisible();
  }
}
