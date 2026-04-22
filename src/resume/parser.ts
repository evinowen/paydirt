import fs from 'fs'
import path from 'path'
import mammoth from 'mammoth'

export interface WorkExperience {
  company: string
  title: string
  duration?: string
  description?: string
}

export interface Education {
  institution: string
  degree?: string
  year?: string
}

export interface ResumeData {
  rawText: string
  path: string
  name?: string
  email?: string
  phone?: string
  skills: string[]
  experience: WorkExperience[]
  education: Education[]
}

export async function parseResume(resumePath: string): Promise<ResumeData> {
  const absolutePath = path.resolve(resumePath)
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Resume not found: ${absolutePath}`)
  }

  const result = await mammoth.extractRawText({ path: absolutePath })
  const rawText = result.value
  const lines = rawText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)

  const data: ResumeData = {
    rawText,
    path: absolutePath,
    skills: [],
    experience: [],
    education: [],
  }

  const emailMatch = rawText.match(/[\w.+-]+@[\w-]+\.[\w.]+/)
  if (emailMatch) data.email = emailMatch[0]

  const phoneMatch = rawText.match(/[\+]?[(]?[0-9]{3}[)]?[-\s\.]?[0-9]{3}[-\s\.]?[0-9]{4,6}/)
  if (phoneMatch) data.phone = phoneMatch[0]

  if (lines.length > 0 && !lines[0].includes('@')) {
    data.name = lines[0]
  }

  const skillsIdx = lines.findIndex((l) => /^skills?$/i.test(l))
  if (skillsIdx !== -1) {
    const nextIdx = lines.findIndex((l, i) => i > skillsIdx && isSectionHeader(l))
    const skillLines = lines.slice(skillsIdx + 1, nextIdx === -1 ? skillsIdx + 10 : nextIdx)
    data.skills = skillLines
      .flatMap((l) => l.split(/[,•|]/))
      .map((s) => s.trim())
      .filter(Boolean)
  }

  const expIdx = lines.findIndex((l) => /^(work\s+)?experience$/i.test(l))
  if (expIdx !== -1) {
    const nextIdx = lines.findIndex((l, i) => i > expIdx && isSectionHeader(l))
    data.experience = parseExperience(lines.slice(expIdx + 1, nextIdx === -1 ? undefined : nextIdx))
  }

  const eduIdx = lines.findIndex((l) => /^education$/i.test(l))
  if (eduIdx !== -1) {
    const nextIdx = lines.findIndex((l, i) => i > eduIdx && isSectionHeader(l))
    data.education = parseEducation(lines.slice(eduIdx + 1, nextIdx === -1 ? undefined : nextIdx))
  }

  return data
}

function isSectionHeader(line: string): boolean {
  return (
    /^(skills?|experience|education|work|projects?|certifications?|summary|objective)$/i.test(
      line,
    ) && line.length < 50
  )
}

function parseExperience(lines: string[]): WorkExperience[] {
  const experiences: WorkExperience[] = []
  let current: Partial<WorkExperience> | null = null
  const descLines: string[] = []

  for (const line of lines) {
    if (/\d{4}\s*[-–]\s*(\d{4}|present)/i.test(line)) {
      if (current) {
        current.description = descLines.splice(0).join(' ')
        experiences.push(current as WorkExperience)
      }
      current = { duration: line }
    } else if (current && !current.title) {
      current.title = line
    } else if (current && !current.company) {
      current.company = line
    } else {
      descLines.push(line)
    }
  }

  if (current) {
    current.description = descLines.join(' ')
    experiences.push(current as WorkExperience)
  }

  return experiences.filter((e) => e.title || e.company)
}

function parseEducation(lines: string[]): Education[] {
  const educations: Education[] = []
  let current: Partial<Education> | null = null

  for (const line of lines) {
    if (/university|college|school|institute/i.test(line)) {
      if (current) educations.push(current as Education)
      current = { institution: line }
    } else if (current && !current.degree) {
      current.degree = line
    } else if (current && /\d{4}/.test(line)) {
      current.year = line.match(/\d{4}/)?.[0]
    }
  }

  if (current) educations.push(current as Education)
  return educations.filter((e) => e.institution)
}
