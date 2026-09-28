import { ActionButton } from "@/components/admin/widgets";

export function StatusButton({ id, status }: { id: string; status: string }) {
  return status === "SUSPENDED" ? (
    <ActionButton url={`/api/admin/users/${id}/status`} body={{ status: "ACTIVE" }} label="Reactivate" variant="primary" confirm="Reactivate this account?" success="Account reactivated" />
  ) : (
    <ActionButton url={`/api/admin/users/${id}/status`} body={{ status: "SUSPENDED" }} label="Suspend" danger confirm="Suspend this account? They will be signed out everywhere immediately." note={{ field: "reason", label: "Reason", required: true }} success="Account suspended — all sessions revoked" />
  );
}
