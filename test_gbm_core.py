#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Unit tests for core GBM functions.
Run with: python -m pytest test_gbm_core.py -v
"""

import pytest
import numpy as np
import pandas as pd
from math import exp, lgamma


# Import functions from the main script (assuming they're available)
# For now, we'll redefine the core functions here for testing
def biv_poisson_pmf(x, y, lambda1, lambda2, phi, max_k_sum=20):
    """Test version of bivariate Poisson PMF"""
    x, y = int(x), int(y)
    if pd.isna(lambda1) or pd.isna(lambda2) or pd.isna(phi) or lambda1 <= 0 or lambda2 <= 0:
        return 1e-100
    
    current_phi = max(0, min(phi, lambda1 - 1e-7, lambda2 - 1e-7))
    
    try:
        if (lambda1 + lambda2 - current_phi) < 0:
            return 1e-100
        
        log_exp_term = -(lambda1 + lambda2 - current_phi)
        log_prob_sum_terms = []
        
        for k in range(min(x, y, max_k_sum) + 1):
            log_fact_xk = lgamma(x - k + 1)
            log_fact_yk = lgamma(y - k + 1)
            log_fact_k = lgamma(k + 1)
            
            val_lambda1_minus_phi = lambda1 - current_phi
            val_lambda2_minus_phi = lambda2 - current_phi
            
            if val_lambda1_minus_phi < 0 or val_lambda2_minus_phi < 0:
                log_term1 = -np.inf
                log_term2 = -np.inf
            else:
                log_term1 = (x - k) * np.log(val_lambda1_minus_phi) if val_lambda1_minus_phi > 1e-9 else -np.inf
                log_term2 = (y - k) * np.log(val_lambda2_minus_phi) if val_lambda2_minus_phi > 1e-9 else -np.inf
            
            log_term3 = k * np.log(current_phi) if current_phi > 1e-9 else -np.inf
            
            current_log_sum_term = log_term1 - log_fact_xk + log_term2 - log_fact_yk + log_term3 - log_fact_k
            log_prob_sum_terms.append(current_log_sum_term)
        
        if not log_prob_sum_terms:
            return 1e-100
        
        max_log_term = np.nanmax(log_prob_sum_terms)
        if max_log_term == -np.inf:
            return 1e-100
        
        sum_exp_terms = np.sum(np.exp(np.array(log_prob_sum_terms) - max_log_term))
        log_sum_val = max_log_term + np.log(sum_exp_terms)
        
        final_log_prob = log_exp_term + log_sum_val
        return exp(final_log_prob)
    
    except (ValueError, OverflowError):
        return 1e-100


def calculate_ev_for_ah_bet(p_w, p_hw, p_p, p_hl, p_l, odds):
    """Calculate expected value for Asian Handicap bet"""
    if pd.isna(odds) or odds <= 0:
        return np.nan
    
    profit_win = odds - 1
    profit_hw = (odds - 1) / 2
    profit_p = 0
    profit_hl = -0.5
    profit_l = -1.0
    
    return (p_w * profit_win) + (p_hw * profit_hw) + (p_p * profit_p) + (p_hl * profit_hl) + (p_l * profit_l)


def get_closest_ah_line(predicted_goal_diff):
    """Get closest Asian Handicap line"""
    if pd.isna(predicted_goal_diff):
        return np.nan
    
    # Round to nearest 0.25
    rounded = round(predicted_goal_diff * 4) / 4
    
    # Clamp to reasonable range
    return max(-3.0, min(3.0, rounded))


class TestBivariatePoisson:
    """Test bivariate Poisson PMF function"""
    
    def test_basic_functionality(self):
        """Test basic PMF calculation"""
        prob = biv_poisson_pmf(1, 1, 1.5, 1.2, 0.1)
        assert 0 < prob < 1, "Probability should be between 0 and 1"
    
    def test_zero_goals(self):
        """Test probability of 0-0 scoreline"""
        prob = biv_poisson_pmf(0, 0, 1.5, 1.2, 0.1)
        assert 0 < prob < 1, "0-0 probability should be positive"
    
    def test_invalid_inputs(self):
        """Test handling of invalid inputs"""
        # Negative lambdas
        prob = biv_poisson_pmf(1, 1, -1.0, 1.2, 0.1)
        assert prob == 1e-100, "Should return minimum probability for negative lambda"
        
        # NaN inputs
        prob = biv_poisson_pmf(1, 1, np.nan, 1.2, 0.1)
        assert prob == 1e-100, "Should handle NaN inputs"
    
    def test_phi_constraints(self):
        """Test phi parameter constraints"""
        # Phi greater than min(lambda1, lambda2) should be clipped
        prob1 = biv_poisson_pmf(1, 1, 1.0, 1.2, 2.0)  # phi > min(lambdas)
        prob2 = biv_poisson_pmf(1, 1, 1.0, 1.2, 0.9)  # phi < min(lambdas)
        
        assert prob1 > 0, "Should handle phi constraint violation gracefully"
        assert prob2 > 0, "Should work with valid phi"
    
    def test_symmetry(self):
        """Test symmetry property: P(x,y) = P(y,x) when lambda1=lambda2"""
        lambda_val = 1.5
        phi = 0.2
        
        prob_xy = biv_poisson_pmf(2, 1, lambda_val, lambda_val, phi)
        prob_yx = biv_poisson_pmf(1, 2, lambda_val, lambda_val, phi)
        
        assert abs(prob_xy - prob_yx) < 1e-10, "Should be symmetric when lambdas are equal"


class TestExpectedValue:
    """Test expected value calculations"""
    
    def test_sure_win(self):
        """Test EV calculation for guaranteed win"""
        ev = calculate_ev_for_ah_bet(1.0, 0.0, 0.0, 0.0, 0.0, 2.0)
        assert abs(ev - 1.0) < 1e-10, "EV should equal odds-1 for sure win"
    
    def test_sure_loss(self):
        """Test EV calculation for guaranteed loss"""
        ev = calculate_ev_for_ah_bet(0.0, 0.0, 0.0, 0.0, 1.0, 2.0)
        assert abs(ev - (-1.0)) < 1e-10, "EV should be -1 for sure loss"
    
    def test_fair_bet(self):
        """Test EV for theoretically fair bet"""
        # 50% chance to win at 2.0 odds should have EV ≈ 0
        ev = calculate_ev_for_ah_bet(0.5, 0.0, 0.0, 0.0, 0.5, 2.0)
        assert abs(ev) < 1e-10, "Fair bet should have EV ≈ 0"
    
    def test_half_win_half_loss(self):
        """Test half-win and half-loss scenarios"""
        # Test half-win: profit should be (odds-1)/2
        ev_hw = calculate_ev_for_ah_bet(0.0, 1.0, 0.0, 0.0, 0.0, 2.0)
        assert abs(ev_hw - 0.5) < 1e-10, "Half-win should give (odds-1)/2 profit"
        
        # Test half-loss: loss should be -0.5
        ev_hl = calculate_ev_for_ah_bet(0.0, 0.0, 0.0, 1.0, 0.0, 2.0)
        assert abs(ev_hl - (-0.5)) < 1e-10, "Half-loss should give -0.5 loss"
    
    def test_invalid_odds(self):
        """Test handling of invalid odds"""
        ev = calculate_ev_for_ah_bet(0.5, 0.0, 0.0, 0.0, 0.5, 0.0)
        assert pd.isna(ev), "Should return NaN for zero odds"
        
        ev = calculate_ev_for_ah_bet(0.5, 0.0, 0.0, 0.0, 0.5, -1.0)
        assert pd.isna(ev), "Should return NaN for negative odds"


class TestAsianHandicapLines:
    """Test Asian Handicap line calculations"""
    
    def test_basic_rounding(self):
        """Test basic rounding to nearest 0.25"""
        assert get_closest_ah_line(0.1) == 0.0
        assert get_closest_ah_line(0.13) == 0.25
        assert get_closest_ah_line(0.37) == 0.25
        assert get_closest_ah_line(0.38) == 0.5
        assert get_closest_ah_line(-0.6) == -0.5
    
    def test_edge_cases(self):
        """Test edge cases"""
        assert pd.isna(get_closest_ah_line(np.nan))
        assert get_closest_ah_line(5.0) == 3.0  # Should clamp to max
        assert get_closest_ah_line(-5.0) == -3.0  # Should clamp to min
    
    def test_exact_quarters(self):
        """Test exact quarter values"""
        assert get_closest_ah_line(0.25) == 0.25
        assert get_closest_ah_line(-0.75) == -0.75
        assert get_closest_ah_line(1.5) == 1.5


class TestDataQuality:
    """Test data quality and edge cases"""
    
    def test_probability_normalization(self):
        """Test that probabilities sum to reasonable values"""
        lambda1, lambda2, phi = 1.5, 1.3, 0.2
        total_prob = 0
        
        # Sum probabilities for reasonable scoreline range
        for x in range(6):
            for y in range(6):
                total_prob += biv_poisson_pmf(x, y, lambda1, lambda2, phi)
        
        # Should be close to 1 (within tolerance for truncation)
        assert 0.9 < total_prob < 1.1, f"Total probability {total_prob} should be close to 1"
    
    def test_numerical_stability(self):
        """Test numerical stability with extreme values"""
        # Very small lambdas
        prob = biv_poisson_pmf(0, 0, 0.01, 0.01, 0.001)
        assert prob > 0, "Should handle very small lambdas"
        
        # Large lambdas
        prob = biv_poisson_pmf(5, 5, 5.0, 5.0, 0.5)
        assert prob > 0, "Should handle large lambdas"
    
    def test_realistic_football_scenarios(self):
        """Test with realistic football match scenarios"""
        scenarios = [
            (1, 1, 1.4, 1.2, 0.15),  # Typical close match
            (0, 0, 0.8, 0.7, 0.05),  # Defensive match
            (3, 2, 2.1, 1.8, 0.25),  # High-scoring match
            (0, 3, 0.9, 2.3, 0.1),   # One-sided match
        ]
        
        for home_goals, away_goals, lambda_h, lambda_a, phi in scenarios:
            prob = biv_poisson_pmf(home_goals, away_goals, lambda_h, lambda_a, phi)
            assert 0 < prob < 0.5, f"Realistic scenario probability {prob} should be reasonable"


if __name__ == "__main__":
    # Run tests if script is executed directly
    pytest.main([__file__, "-v"])
