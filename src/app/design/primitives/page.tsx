"use client";

import {
  ArrowRight,
  CalendarPlus,
  FolderOpen,
  MoreHorizontal,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";

import { PersonAvatar, AvatarGroup } from "@/components/ui/avatar";
import { Badge, CountBadge, StatusPill } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from "@/components/ui/combobox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from "@/components/ui/feedback";
import { Input, Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableNumericCell,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";
import { ToastProvider, ToastViewport, useToast } from "@/components/ui/toast";
import { SimpleTooltip, TooltipProvider } from "@/components/ui/tooltip";

/**
 * Every primitive, in every state.
 *
 * The point of laying them out together is that a missing state is obvious:
 * a column with a gap in it is a control someone will meet in an undesigned
 * condition. Content is drawn from the seed org so density is realistic.
 */

function Section({
  title,
  intro,
  children,
}: {
  title: string;
  intro?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="border-border border-t pt-10">
      <h2 className="text-heading-lg font-display text-fg-default">{title}</h2>
      {intro ? <p className="text-fg-muted mt-2 max-w-2xl text-body">{intro}</p> : null}
      <div className="mt-6">{children}</div>
    </section>
  );
}

/** A labelled cell, so each state is named rather than left to be inferred. */
function State({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-caption text-fg-subtle">{label}</span>
      {children}
    </div>
  );
}

const PROJECT_STATUSES = [
  { value: "planning", label: "Planning" },
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
];

const ASSIGNEES = [
  { value: "marc", label: "Marc Dubois" },
  { value: "priya", label: "Priya Raman" },
  { value: "lukas", label: "Lukas Weber" },
  { value: "ines", label: "Ines Ferreira" },
  { value: "nadia", label: "Nadia Haddad" },
  { value: "oscar", label: "Oscar Lindqvist" },
];

const TEAM = [
  { name: "Claire Moreau" },
  { name: "Yusuf Karim" },
  { name: "Marc Dubois" },
  { name: "Nadia Haddad" },
  { name: "Sofia Laurent" },
];

const TASKS = [
  { title: "Checkout rebuild, payment step", who: "Lukas Weber", status: "active", due: "in 3 days", hours: 16 },
  { title: "Catalogue export from the legacy storefront", who: "Ines Ferreira", status: "complete", due: "done", hours: 8 },
  { title: "Load test at 4x expected peak", who: "Lukas Weber", status: "blocked", due: "2 days ago", hours: 12 },
  { title: "Cutover rehearsal with Northwind ops", who: null, status: "neutral", due: "no date", hours: 6 },
] as const;

function ToastDemo() {
  const toast = useToast();
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        onClick={() =>
          toast.add({
            title: "Task completed",
            description: "Load test at 4x expected peak.",
            data: { tone: "success" },
          })
        }
      >
        Success
      </Button>
      <Button
        onClick={() =>
          toast.add({
            title: "Due tomorrow",
            description: "Three tasks on Meridian rebrand.",
            data: { tone: "warning" },
          })
        }
      >
        Warning
      </Button>
      <Button
        onClick={() =>
          toast.add({
            title: "Could not save",
            description: "The project was changed by someone else.",
            data: { tone: "error" },
          })
        }
      >
        Error
      </Button>
      <Button
        onClick={() =>
          toast.add({
            title: "Task moved to Done",
            actionProps: { children: "Undo", onClick: () => undefined },
          })
        }
      >
        With undo
      </Button>
    </div>
  );
}

export default function PrimitivesPage() {
  const [invalidEmail, setInvalidEmail] = useState("not-an-email");

  return (
    <ToastProvider>
      <TooltipProvider delay={350}>
        <div className="mx-auto max-w-5xl px-5 py-10 sm:px-8 sm:py-14">
          <header>
            <h1 className="text-display-lg font-display text-fg-default">Primitives</h1>
            <p className="text-fg-muted mt-2 max-w-2xl text-body-lg">
              Every control, in every state it can be in. Nothing here writes a raw hex or an
              inline style; each one names semantic tokens, so all of it re-themes at once.
            </p>
          </header>

          <div className="mt-12 space-y-12">
            <Section
              title="Button"
              intro="Pressed changes colour rather than position. A button that nudges down a pixel makes a toolbar twitch under the cursor, and it is a transform, which this system does not animate."
            >
              <div className="space-y-6">
                {(["primary", "secondary", "ghost", "destructive"] as const).map((variant) => (
                  <div key={variant}>
                    <h3 className="text-label text-fg-default mb-3 capitalize">{variant}</h3>
                    <div className="flex flex-wrap items-end gap-6">
                      <State label="Default">
                        <Button variant={variant}>Publish project</Button>
                      </State>
                      <State label="Hover / active">
                        <Button variant={variant}>Hover me</Button>
                      </State>
                      <State label="Disabled">
                        <Button variant={variant} disabled>
                          Publish project
                        </Button>
                      </State>
                      <State label="Loading">
                        <Button variant={variant} loading>
                          Publishing
                        </Button>
                      </State>
                    </div>
                  </div>
                ))}

                <div>
                  <h3 className="text-label text-fg-default mb-3">Sizes and icons</h3>
                  <div className="flex flex-wrap items-end gap-6">
                    <State label="sm (32px)">
                      <Button size="sm">Assign</Button>
                    </State>
                    <State label="md (36px)">
                      <Button size="md">Assign</Button>
                    </State>
                    <State label="lg (40px)">
                      <Button size="lg">Assign</Button>
                    </State>
                    <State label="With icon">
                      <Button variant="primary">
                        <Plus aria-hidden className="size-4" />
                        New task
                      </Button>
                    </State>
                    <State label="Icon only">
                      <SimpleTooltip content="More actions">
                        <Button size="icon" variant="ghost" aria-label="More actions">
                          <MoreHorizontal aria-hidden className="size-4" />
                        </Button>
                      </SimpleTooltip>
                    </State>
                    <State label="Link">
                      <Button variant="link">
                        View all 60 tasks
                        <ArrowRight aria-hidden className="size-4" />
                      </Button>
                    </State>
                  </div>
                </div>
              </div>
            </Section>

            <Section
              title="Form fields"
              intro="Labels are real labels, wired to their control. The old app used placeholder text as a label, which vanishes the moment someone types and leaves a screen reader with nothing to announce."
            >
              <div className="grid gap-6 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Project name</FieldLabel>
                  <Input placeholder="e.g. Meridian rebrand" />
                  <FieldDescription>Shown everywhere this project appears.</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>Project key</FieldLabel>
                  <Input defaultValue="MER" />
                  <FieldDescription>Three letters, used in the command palette.</FieldDescription>
                </Field>

                <Field>
                  <FieldLabel>Disabled</FieldLabel>
                  <Input defaultValue="Locked while archived" disabled />
                </Field>

                <Field>
                  <FieldLabel>Invalid</FieldLabel>
                  <Input
                    aria-invalid
                    value={invalidEmail}
                    onChange={(event) => setInvalidEmail(event.target.value)}
                  />
                  {/* `match` takes a boolean or a ValidityState key; `true`
                      pins the message open so the state is visible here. */}
                  <FieldError match>Enter a valid email address.</FieldError>
                </Field>

                <Field className="sm:col-span-2">
                  <FieldLabel>Description</FieldLabel>
                  <Textarea placeholder="What is this project for?" />
                </Field>
              </div>
            </Section>

            <Section
              title="Select and Combobox"
              intro="Select for a short, known list. Combobox once someone would rather type than scroll -- it is what the assignee picker and the command palette are built from."
            >
              <div className="grid gap-6 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Status</FieldLabel>
                  {/* `items` is what lets the trigger show "Active" rather
                      than the raw stored value. */}
                  <Select items={PROJECT_STATUSES} defaultValue="active">
                    <SelectTrigger>
                      <SelectValue placeholder="Choose a status" />
                    </SelectTrigger>
                    <SelectContent>
                      {PROJECT_STATUSES.map((status) => (
                        <SelectItem key={status.value} value={status.value}>
                          {status.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>

                <Field>
                  <FieldLabel>Assignee</FieldLabel>
                  <Combobox items={ASSIGNEES}>
                    <ComboboxInput placeholder="Search people" />
                    <ComboboxContent emptyMessage="Nobody by that name">
                      <ComboboxList>
                        {(item: (typeof ASSIGNEES)[number]) => (
                          <ComboboxItem key={item.value} value={item}>
                            {item.label}
                          </ComboboxItem>
                        )}
                      </ComboboxList>
                    </ComboboxContent>
                  </Combobox>
                </Field>

                <Field>
                  <FieldLabel>Disabled select</FieldLabel>
                  <Select disabled>
                    <SelectTrigger>
                      <SelectValue placeholder="Not available" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </Section>

            <Section
              title="Status and badges"
              intro="A dot as well as a colour, so the four tones stay apart for anyone who cannot separate them by hue. The label always carries the meaning."
            >
              <div className="flex flex-wrap items-center gap-3">
                <StatusPill tone="complete">Complete</StatusPill>
                <StatusPill tone="attention">Due soon</StatusPill>
                <StatusPill tone="active">In progress</StatusPill>
                <StatusPill tone="blocked">Blocked</StatusPill>
                <StatusPill tone="neutral">No deadline</StatusPill>
                <Badge tone="accent">Owner</Badge>
                <Badge>Engineering</Badge>
                <CountBadge>13</CountBadge>
                <CountBadge tone="blocked">6</CountBadge>
              </div>
            </Section>

            <Section
              title="Avatar"
              intro="Initials on a neutral ground. A colour per person would be a fifth meaning for hue, and hue here is spoken for."
            >
              <div className="flex flex-wrap items-end gap-6">
                <State label="xs / sm / md / lg / xl">
                  <div className="flex items-end gap-2">
                    <PersonAvatar name="Marc Dubois" size="xs" />
                    <PersonAvatar name="Priya Raman" size="sm" />
                    <PersonAvatar name="Elena Rossi" size="md" />
                    <PersonAvatar name="Amina Benali" size="lg" />
                    <PersonAvatar name="Tom Decker" size="xl" />
                  </div>
                </State>
                <State label="Project team">
                  <AvatarGroup people={TEAM} />
                </State>
              </div>
            </Section>

            <Section
              title="Table"
              intro="Lists come before boards, so the table is a primary surface. Rules rather than stripes, a header that stays put, and a hover that changes colour without moving anything."
            >
              <TableContainer>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Task</TableHead>
                      <TableHead>Assignee</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead className="text-right">Est.</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {TASKS.map((task) => (
                      <TableRow key={task.title}>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell>
                          {task.who ? (
                            <span className="flex items-center gap-2">
                              <PersonAvatar name={task.who} size="xs" />
                              {task.who}
                            </span>
                          ) : (
                            <span className="text-fg-subtle">Unassigned</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <StatusPill tone={task.status} size="sm">
                            {task.status === "complete"
                              ? "Complete"
                              : task.status === "blocked"
                                ? "Blocked"
                                : task.status === "active"
                                  ? "In progress"
                                  : "To do"}
                          </StatusPill>
                        </TableCell>
                        <TableCell className="text-fg-muted">{task.due}</TableCell>
                        <TableNumericCell>{task.hours}h</TableNumericCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Section>

            <Section
              title="Card"
              intro="Lighter than the canvas with a border, so elevation reads without a drop shadow. A page of shadowed boxes becomes noise before it becomes hierarchy."
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Northwind replatform</CardTitle>
                      <CardDescription>Due in 9 days &middot; Engineering</CardDescription>
                    </div>
                    <StatusPill tone="blocked" size="sm">
                      2 blocked
                    </StatusPill>
                  </CardHeader>
                  <CardContent>
                    <AvatarGroup
                      people={[
                        { name: "Elena Rossi" },
                        { name: "Lukas Weber" },
                        { name: "Ines Ferreira" },
                      ]}
                    />
                  </CardContent>
                  <CardFooter>
                    <Button size="sm">Open project</Button>
                    <Button size="sm" variant="ghost">
                      Team
                    </Button>
                  </CardFooter>
                </Card>

                <Card>
                  <CardContent className="p-0">
                    <EmptyState
                      icon={<FolderOpen />}
                      title="No projects yet"
                      description="Projects group the work, the people on it, and the deadline it has to meet."
                      action={
                        <Button variant="primary">
                          <Plus aria-hidden className="size-4" />
                          New project
                        </Button>
                      }
                    />
                  </CardContent>
                </Card>
              </div>
            </Section>

            <Section
              title="Tabs"
              intro="Person and project detail are routed pages with tabs, not modals. The active tab is an underline plus a weight change, never colour alone."
            >
              <Tabs defaultValue="overview">
                <TabsList>
                  <TabsTab value="overview">Overview</TabsTab>
                  <TabsTab value="tasks">Tasks</TabsTab>
                  <TabsTab value="team">Team</TabsTab>
                  <TabsTab value="activity">Activity</TabsTab>
                  <TabsTab value="billing" disabled>
                    Billing
                  </TabsTab>
                </TabsList>
                <TabsPanel value="overview">
                  <p className="text-body text-fg-muted">
                    Full identity rebuild for Meridian Bank: positioning, visual identity, and a
                    rollout kit for 40 branches.
                  </p>
                </TabsPanel>
                <TabsPanel value="tasks">
                  <p className="text-body text-fg-muted">Ten tasks, three of them overdue.</p>
                </TabsPanel>
                <TabsPanel value="team">
                  <AvatarGroup people={TEAM} size="md" />
                </TabsPanel>
                <TabsPanel value="activity">
                  <p className="text-body text-fg-muted">
                    Claire Moreau completed &ldquo;Positioning territories&rdquo; 2 hours ago.
                  </p>
                </TabsPanel>
              </Tabs>
            </Section>

            <Section
              title="Dialog and Drawer"
              intro="A dialog is for a confirmation and nothing else, and never opens another dialog. A task opens in a drawer, so the list you came from stays visible behind it."
            >
              <div className="flex flex-wrap gap-3">
                <Dialog>
                  <DialogTrigger render={<Button variant="destructive" />}>
                    <Trash2 aria-hidden className="size-4" />
                    Delete project
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Delete Meridian rebrand?</DialogTitle>
                      <DialogDescription>
                        Ten tasks and their history go with it. This cannot be undone.
                      </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                      <DialogClose render={<Button variant="secondary" />}>Cancel</DialogClose>
                      <DialogClose render={<Button variant="destructive" />}>
                        Delete project
                      </DialogClose>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Drawer>
                  <DrawerTrigger render={<Button />}>Open a task</DrawerTrigger>
                  <DrawerContent>
                    <DrawerHeader>
                      <DrawerTitle>Load test at 4x expected peak</DrawerTitle>
                      <DrawerDescription>
                        Northwind replatform &middot; Lukas Weber
                      </DrawerDescription>
                    </DrawerHeader>
                    <DrawerBody className="space-y-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusPill tone="blocked">Blocked</StatusPill>
                        <span className="text-caption text-fg-muted">Overdue by 2 days</span>
                      </div>
                      <div className="bg-blocked-bg border-blocked-border rounded-control border p-3">
                        <p className="text-label text-blocked-text">Blocker</p>
                        <p className="text-body text-fg-default mt-1">
                          Staging environment is down, cannot verify the fix.
                        </p>
                      </div>
                      <Field>
                        <FieldLabel>Add a note</FieldLabel>
                        <Textarea placeholder="What changed?" />
                      </Field>
                    </DrawerBody>
                    <DrawerFooter>
                      <Button variant="primary">Mark complete</Button>
                      <Button variant="secondary">Clear blocker</Button>
                      <DrawerClose render={<Button variant="ghost" />}>Close</DrawerClose>
                    </DrawerFooter>
                  </DrawerContent>
                </Drawer>
              </div>
            </Section>

            <Section
              title="Toast"
              intro="Confirmation that something happened, and the chance to undo it. Reserved for the result of an action someone took."
            >
              <ToastDemo />
            </Section>

            <Section
              title="Empty, loading and error"
              intro="The three states besides the happy one. A screen is not done until all three are designed, which is why they live in one file -- a gap is obvious."
            >
              <div className="space-y-4">
                <div className="border-border rounded-card border">
                  <EmptyState
                    icon={<CalendarPlus />}
                    title="Nothing due today"
                    description="Six tasks are due this week. The next one is Wednesday."
                    action={<Button variant="secondary">View the week</Button>}
                  />
                </div>

                <div className="border-border rounded-card border">
                  <TableSkeleton rows={4} columns={5} />
                </div>

                <div className="border-border rounded-card border">
                  <ErrorState
                    description="The task list could not be loaded. The database may still be starting."
                    action={<Button variant="secondary">Try again</Button>}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <Skeleton className="size-8 rounded-pill" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              </div>
            </Section>
          </div>

          <footer className="border-border text-caption text-fg-subtle mt-14 border-t pt-6">
            Tab through this page to see the focus treatment on every control.
          </footer>
        </div>

        <ToastViewport />
      </TooltipProvider>
    </ToastProvider>
  );
}
