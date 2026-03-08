"use client"

import { Clock, Users, ChefHat, Lightbulb, ExternalLink, Copy, Check } from "lucide-react"
import { useState } from "react"

interface Recipe {
  title: string
  description?: string
  image?: string
  prepTime?: string
  cookTime?: string
  totalTime?: string
  servings?: string
  ingredients: string[]
  instructions: string[]
  tips?: string[]
  source: string
}

export function RecipeDisplay({ recipe }: { recipe: Recipe }) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    const text = `${recipe.title}

INGREDIENTS:
${recipe.ingredients.map((i) => `• ${i}`).join("\n")}

INSTRUCTIONS:
${recipe.instructions.map((s, i) => `${i + 1}. ${s}`).join("\n")}
${recipe.tips && recipe.tips.length > 0 ? `\nTIPS:\n${recipe.tips.map((t) => `• ${t}`).join("\n")}` : ""}

Source: ${recipe.source}`

    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-balance">{recipe.title}</h2>
          {recipe.description && (
            <p className="text-muted-foreground text-pretty max-w-2xl">{recipe.description}</p>
          )}
        </div>
        <button
          onClick={copyToClipboard}
          className="flex items-center gap-2 rounded-lg bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary/80"
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>

      {/* Meta info */}
      {(recipe.prepTime || recipe.cookTime || recipe.totalTime || recipe.servings) && (
        <div className="flex flex-wrap gap-4">
          {recipe.prepTime && (
            <div className="flex items-center gap-2 rounded-lg bg-card px-4 py-3 border border-border">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Prep</p>
                <p className="font-medium">{recipe.prepTime}</p>
              </div>
            </div>
          )}
          {recipe.cookTime && (
            <div className="flex items-center gap-2 rounded-lg bg-card px-4 py-3 border border-border">
              <ChefHat className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Cook</p>
                <p className="font-medium">{recipe.cookTime}</p>
              </div>
            </div>
          )}
          {recipe.totalTime && !recipe.prepTime && !recipe.cookTime && (
            <div className="flex items-center gap-2 rounded-lg bg-card px-4 py-3 border border-border">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Total</p>
                <p className="font-medium">{recipe.totalTime}</p>
              </div>
            </div>
          )}
          {recipe.servings && (
            <div className="flex items-center gap-2 rounded-lg bg-card px-4 py-3 border border-border">
              <Users className="h-5 w-5 text-muted-foreground" />
              <div>
                <p className="text-xs text-muted-foreground">Servings</p>
                <p className="font-medium">{recipe.servings}</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Ingredients */}
      <section className="space-y-4">
        <h3 className="text-xl font-semibold flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Ingredients
        </h3>
        <ul className="grid gap-2 sm:grid-cols-2">
          {recipe.ingredients.map((ingredient, index) => (
            <li
              key={index}
              className="flex items-start gap-3 rounded-lg bg-card p-3 border border-border"
            >
              <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-muted-foreground/50" />
              <span className="text-foreground">{ingredient}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* Instructions */}
      <section className="space-y-4">
        <h3 className="text-xl font-semibold flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent" />
          Instructions
        </h3>
        <ol className="space-y-4">
          {recipe.instructions.map((step, index) => (
            <li key={index} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-semibold text-sm">
                {index + 1}
              </span>
              <p className="pt-1 text-foreground leading-relaxed">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Tips */}
      {recipe.tips && recipe.tips.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-xl font-semibold flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-accent" />
            Tips
          </h3>
          <ul className="space-y-2">
            {recipe.tips.map((tip, index) => (
              <li
                key={index}
                className="rounded-lg bg-accent/10 border border-accent/20 p-4 text-foreground"
              >
                {tip}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Source */}
      <div className="pt-4 border-t border-border">
        <a
          href={recipe.source}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ExternalLink className="h-4 w-4" />
          View original recipe
        </a>
      </div>
    </div>
  )
}
