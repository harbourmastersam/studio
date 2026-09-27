"use client";
import { Studio } from "@/components/gui/studio";
import MySQLProbe from "@/components/embed/mysql-probe";
import { StudioExtensionManager } from "@/core/extension-manager";
import {
  createMySQLExtensions,
  createPostgreSQLExtensions,
  createSQLiteExtensions,
} from "@/core/standard-extension";
import { EmbedQueryable } from "@/drivers/iframe-driver";
import MySQLLikeDriver from "@/drivers/mysql/mysql-driver";
import PostgresLikeDriver from "@/drivers/postgres/postgres-driver";
import ElectronSavedDocs from "@/drivers/saved-doc/electron-saved-doc";
import { SqliteLikeBaseDriver } from "@/drivers/sqlite-base-driver";
import DoltExtension from "@/extensions/dolt";
import LocalSettingSidebar from "@/extensions/local-setting-sidebar";
import { useAvailableAIAgents } from "@/lib/ai-agent-storage";
import { parseEmbedDatabase } from "@/lib/embed-database";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";

export default function EmbedPageClient({
  driverName,
}: {
  driverName: string;
}) {
  const params = useSearchParams();
  const modes = params.getAll("mode");
  const channels = params.getAll("channel");
  if (driverName === "mysql" && modes.length === 1 && modes[0] === "probe") {
    return <MySQLProbe channel={channels.length === 1 ? channels[0] : null} />;
  }

  let selectedDatabase: string | undefined;
  if (driverName === "mysql") {
    const database = parseEmbedDatabase(params);
    if (!database.valid) {
      return <div role="alert">Unable to open this database viewer.</div>;
    }
    selectedDatabase = database.value;
  }

  return (
    <EmbedStudioPage
      driverName={driverName}
      selectedDatabase={selectedDatabase}
    />
  );
}

function EmbedStudioPage({
  driverName,
  selectedDatabase,
}: {
  driverName: string;
  selectedDatabase?: string;
}) {
  const searchParams = useSearchParams();
  const channels = searchParams.getAll("channel");
  const channel = channels.length === 1 ? channels[0] : null;

  const [driver, queryable] = useMemo(() => {
    const queryable = new EmbedQueryable(channel);
    return [
      createDatabaseDriver(driverName, queryable, selectedDatabase),
      queryable,
    ];
  }, [driverName, channel, selectedDatabase]);

  const savedDocDriver = useMemo(() => {
    if (window.outerbaseIpc?.docs) {
      return new ElectronSavedDocs();
    }
  }, []);

  const extensions = useMemo(() => {
    return new StudioExtensionManager(createEmbedExtensions(driverName));
  }, [driverName]);

  const agentDriver = useAvailableAIAgents(driver);

  useEffect(() => {
    return queryable.listen();
  }, [queryable]);

  return (
    <Studio
      driver={driver}
      extensions={extensions}
      docDriver={savedDocDriver}
      name={searchParams.get("name") || "Unnamed Connection"}
      color={searchParams.get("color") || "gray"}
      agentDriver={agentDriver}
    />
  );
}

function createDatabaseDriver(
  driverName: string,
  queryable: EmbedQueryable,
  selectedDatabase?: string
) {
  if (driverName === "turso") {
    return new SqliteLikeBaseDriver(queryable);
  } else if (driverName === "sqlite") {
    return new SqliteLikeBaseDriver(queryable);
  } else if (driverName === "starbase") {
    return new SqliteLikeBaseDriver(queryable);
  } else if (driverName === "mysql" || driverName === "dolt") {
    return new MySQLLikeDriver(queryable, selectedDatabase ?? "");
  } else if (driverName === "postgres") {
    return new PostgresLikeDriver(queryable);
  }

  return new SqliteLikeBaseDriver(queryable);
}

function createEmbedExtensions(driverName: string) {
  if (driverName === "turso") {
    return [...createSQLiteExtensions(), new LocalSettingSidebar()];
  } else if (driverName === "sqlite" || driverName === "starbase") {
    return [...createSQLiteExtensions(), new LocalSettingSidebar()];
  } else if (driverName === "mysql") {
    return createMySQLExtensions();
  } else if (driverName === "dolt") {
    return [...createMySQLExtensions(), new DoltExtension()];
  } else if (driverName === "postgres") {
    return createPostgreSQLExtensions();
  }

  return createSQLiteExtensions();
}
