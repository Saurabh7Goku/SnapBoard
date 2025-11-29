# KaTeX Formatting Examples

This document shows example content formatted for the MathTextbookRenderer component.

## Example 1: Probability Theory

```
SECTION 1: CONCEPT EXPLANATION

Probability is a fundamental concept in statistics and mathematics that measures the likelihood of an event occurring. The probability of an event A is defined as the ratio of the number of favorable outcomes to the total number of possible outcomes.

For any event A in a sample space S, the probability satisfies: $0 \leq P(A) \leq 1$

When all outcomes are equally likely, we can calculate probability using:

$$P(A) = \frac{\text{Number of favorable outcomes}}{\text{Total number of possible outcomes}}$$

---

SECTION 2: KEY FORMULAS AND DEFINITIONS

Basic Probability: $$P(A) = \frac{n(A)}{n(S)}$$

Complement Rule: $$P(A^c) = 1 - P(A)$$

Addition Rule: $$P(A \cup B) = P(A) + P(B) - P(A \cap B)$$

Conditional Probability: $$P(A|B) = \frac{P(A \cap B)}{P(B)}$$

Bayes' Theorem: $$P(A|B) = \frac{P(B|A) \cdot P(A)}{P(B)}$$

---

SECTION 3: SOLVED GATE DA LEVEL PROBLEMS

Problem 1: A fair die is rolled once. What is the probability of getting a number greater than 4?

Solution:
1. Identify the sample space: $S = \{1, 2, 3, 4, 5, 6\}$, so $n(S) = 6$
2. Identify favorable outcomes: Numbers greater than 4 are $\{5, 6\}$, so $n(A) = 2$
3. Apply the probability formula: $$P(A) = \frac{2}{6} = \frac{1}{3}$$

Answer: $\frac{1}{3}$ or approximately 0.333

Problem 2: Two coins are tossed simultaneously. Find the probability of getting at least one head.

Solution:
1. Sample space: $S = \{HH, HT, TH, TT\}$, so $n(S) = 4$
2. Favorable outcomes (at least one head): $\{HH, HT, TH\}$, so $n(A) = 3$
3. Calculate probability: $$P(\text{at least one head}) = \frac{3}{4}$$

Alternatively, using the complement rule:
$$P(\text{at least one head}) = 1 - P(\text{no heads}) = 1 - P(TT) = 1 - \frac{1}{4} = \frac{3}{4}$$

Answer: $\frac{3}{4}$ or 0.75

Problem 3: In a class of 100 students, 60 study Mathematics, 40 study Physics, and 20 study both. If a student is selected at random, what is the probability that the student studies Mathematics or Physics?

Solution:
1. Let $M$ = event of studying Mathematics, $P$ = event of studying Physics
2. Given: $n(M) = 60$, $n(P) = 40$, $n(M \cap P) = 20$
3. Using the addition rule: $$P(M \cup P) = P(M) + P(P) - P(M \cap P)$$
4. Substitute values: $$P(M \cup P) = \frac{60}{100} + \frac{40}{100} - \frac{20}{100} = \frac{80}{100}$$

Answer: $\frac{4}{5}$ or 0.8
```

## Example 2: Linear Regression

```
SECTION 1: CONCEPT EXPLANATION

Linear regression is a statistical method for modeling the relationship between a dependent variable and one or more independent variables. In simple linear regression, we assume a linear relationship between the independent variable $x$ and the dependent variable $y$.

The regression line is expressed as: $\hat{y} = a + bx$

where $a$ is the y-intercept and $b$ is the slope of the line.

---

SECTION 2: KEY FORMULAS AND DEFINITIONS

Regression Line Equation: $$\hat{y} = a + bx$$

Slope (b): $$b = \frac{n\sum xy - \sum x \sum y}{n\sum x^2 - (\sum x)^2}$$

Intercept (a): $$a = \bar{y} - b\bar{x}$$

Correlation Coefficient: $$r = \frac{n\sum xy - \sum x \sum y}{\sqrt{[n\sum x^2 - (\sum x)^2][n\sum y^2 - (\sum y)^2]}}$$

Coefficient of Determination: $$R^2 = r^2$$

---

SECTION 3: SOLVED GATE DA LEVEL PROBLEMS

Problem 1: Given the data points $(1, 2)$, $(2, 4)$, $(3, 5)$, find the regression line.

Solution:
1. Calculate required sums:
   - $\sum x = 1 + 2 + 3 = 6$
   - $\sum y = 2 + 4 + 5 = 11$
   - $\sum xy = 1(2) + 2(4) + 3(5) = 2 + 8 + 15 = 25$
   - $\sum x^2 = 1 + 4 + 9 = 14$
   - $n = 3$

2. Calculate the slope: $$b = \frac{3(25) - 6(11)}{3(14) - 36} = \frac{75 - 66}{42 - 36} = \frac{9}{6} = 1.5$$

3. Calculate means: $\bar{x} = \frac{6}{3} = 2$, $\bar{y} = \frac{11}{3} \approx 3.67$

4. Calculate intercept: $$a = 3.67 - 1.5(2) = 3.67 - 3 = 0.67$$

Answer: The regression line is $\hat{y} = 0.67 + 1.5x$
```

## Example 3: Hypothesis Testing

```
SECTION 1: CONCEPT EXPLANATION

Hypothesis testing is a statistical method used to make decisions about population parameters based on sample data. We start with a null hypothesis ($H_0$) and an alternative hypothesis ($H_1$), then use sample data to determine whether to reject or fail to reject the null hypothesis.

The test statistic is calculated and compared with a critical value to make a decision.

---

SECTION 2: KEY FORMULAS AND DEFINITIONS

Test Statistic for Mean (known $\sigma$): $$z = \frac{\bar{x} - \mu_0}{\sigma/\sqrt{n}}$$

Test Statistic for Mean (unknown $\sigma$): $$t = \frac{\bar{x} - \mu_0}{s/\sqrt{n}}$$

Standard Error: $$SE = \frac{\sigma}{\sqrt{n}}$$

Confidence Interval: $$\bar{x} \pm z_{\alpha/2} \cdot \frac{\sigma}{\sqrt{n}}$$

---

SECTION 3: SOLVED GATE DA LEVEL PROBLEMS

Problem 1: A manufacturer claims that the average weight of their product is 500g. A sample of 36 products has a mean weight of 495g with a standard deviation of 12g. Test the claim at a 5% significance level.

Solution:
1. Set up hypotheses:
   - $H_0: \mu = 500$ (null hypothesis)
   - $H_1: \mu \neq 500$ (alternative hypothesis - two-tailed test)

2. Given data: $\bar{x} = 495$, $\mu_0 = 500$, $s = 12$, $n = 36$, $\alpha = 0.05$

3. Calculate test statistic: $$t = \frac{495 - 500}{12/\sqrt{36}} = \frac{-5}{12/6} = \frac{-5}{2} = -2.5$$

4. Find critical value: For two-tailed test with $\alpha = 0.05$ and $df = 35$, $t_{critical} \approx \pm 2.03$

5. Decision: Since $|t| = 2.5 > 2.03$, we reject $H_0$

Answer: At the 5% significance level, we reject the manufacturer's claim. The average weight is significantly different from 500g.
```

## How to Use These Examples

1. Copy the content from any example above
2. Pass it to the `MathTextbookRenderer` component:

```javascript
import { MathTextbookRenderer } from './dashboard/MathTextbookRenderer';

export default function ExamplePage() {
  const content = `
SECTION 1: CONCEPT EXPLANATION
...
  `;

  return <MathTextbookRenderer content={content} isLoading={false} />;
}
```

3. The component will automatically:
   - Parse mathematical expressions in `$...$` and `$$...$$`
   - Render them using KaTeX
   - Format sections, problems, solutions, and answers
   - Apply professional styling

## Formatting Tips

### For Mathematical Expressions

- **Inline**: Use single dollar signs: `$x^2 + y^2 = z^2$`
- **Display**: Use double dollar signs: `$$\int_0^{\infty} e^{-x} dx = 1$$`
- **Fractions**: Use `\frac{numerator}{denominator}`
- **Subscripts**: Use underscore: `x_1`, `\sum_{i=1}^{n}`
- **Superscripts**: Use caret: `x^2`, `e^{-x}`

### For Content Structure

- Always start with `SECTION 1:`, `SECTION 2:`, etc.
- Use `Problem X:` for problem statements
- Use `Solution:` to mark the solution section
- Use `Answer:` or `Final Answer:` for the final answer
- Use numbered lists (1., 2., 3., etc.) for step-by-step solutions
- Use `---` as dividers between major sections

### For Professional Appearance

- Keep paragraphs concise and clear
- Use proper mathematical notation
- Include units in answers
- Provide explanations for each step
- Use consistent formatting throughout

## Common Mathematical Symbols

| Symbol | LaTeX | Usage |
|--------|-------|-------|
| $\sum$ | \sum | Summation |
| $\prod$ | \prod | Product |
| $\int$ | \int | Integration |
| $\sqrt{x}$ | \sqrt{x} | Square root |
| $\frac{a}{b}$ | \frac{a}{b} | Fraction |
| $\alpha$ | \alpha | Greek letter alpha |
| $\beta$ | \beta | Greek letter beta |
| $\mu$ | \mu | Mean/mu |
| $\sigma$ | \sigma | Standard deviation/sigma |
| $\pi$ | \pi | Pi |
| $\infty$ | \infty | Infinity |
| $\approx$ | \approx | Approximately equal |
| $\neq$ | \neq | Not equal |
| $\leq$ | \leq | Less than or equal |
| $\geq$ | \geq | Greater than or equal |

## Testing the Component

To test the MathTextbookRenderer with these examples:

1. Navigate to the GATE DA Helper section
2. Enter a topic (e.g., "Probability")
3. The AI will generate formatted content
4. The MathTextbookRenderer will display it with proper mathematical formatting

Or manually test by importing and using the component directly in your pages.
